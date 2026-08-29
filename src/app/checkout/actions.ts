'use server';
/**
 * Server actions чекаута.
 *  saveCheckout — шаг 1: валидирует форму, кладёт данные в cookie lm_checkout, ведёт на /checkout/confirm.
 *  placeOrder   — шаг 2: создаёт Order + OrderItem в транзакции, чистит корзину и СРАЗУ
 *                 создаёт платёж ЮKassa → покупатель уезжает на платёжную форму (шаг 7).
 * Проверка наличия — в два рубежа (задача 7b):
 *   1) по свежим данным БД (последний синк) — как раньше;
 *   2) ЖИВОЙ запрос остатков у поставщика (AvailabilityAndPrice через прокси) — ловит
 *      товары, разобранные МЕЖДУ синками. Fail-open: если API поставщика молчит или
 *      думает дольше 6 секунд, чекаут НЕ падает — работаем по данным БД, покупатель
 *      ничего не замечает. Заодно, если живые данные получены, в снимок OrderItem.basePrice
 *      пишется закупка НА МОМЕНТ ОПЛАТЫ — маржа в админке становится честной.
 * Если ЮKassa выключена (пустые ключи в .env) или платёж не создался — покупатель
 * попадает на страницу заказа, там есть кнопка «Оплатить».
 * Шаг 4: если покупатель авторизован, в заказ пишется userId (для «Моих заказов» в ЛК).
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCart } from '@/lib/cart';
import { getSessionUser } from '@/lib/auth';
import { checkPurchasable, clampQty } from '@/lib/cart-shared';
import { CHECKOUT_COOKIE, parseCheckout, type CheckoutData, type CheckoutErrors } from '@/lib/checkout-shared';
import { createOrderPayment, isPaymentEnabled, siteUrl } from '@/lib/payment/yookassa';
import { AbsolutClient, parseStock } from '@/lib/supplier/absolut';
import { purchasePriceWithVat } from '@/lib/pricing';
import { calcDelivery } from '@/lib/delivery/calc';

// 7b: сколько ждём живой ответ поставщика, прежде чем откатиться на данные БД.
// Не экспортируется (из 'use server' файла константы экспортировать нельзя).
const LIVE_CHECK_TIMEOUT_MS = 6_000;

export type CheckoutFormState = { errors: CheckoutErrors; values: CheckoutData | null };

export async function saveCheckout(_prev: CheckoutFormState, fd: FormData): Promise<CheckoutFormState> {
  const { data, errors } = parseCheckout(fd);
  if (Object.keys(errors).length > 0) return { errors, values: data };
  cookies().set(CHECKOUT_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // сутки
  });
  redirect('/checkout/confirm');
}

export type PlaceOrderResult = { ok: false; error: string };

export async function placeOrder(): Promise<PlaceOrderResult> {
  const jar = cookies();
  const raw = jar.get(CHECKOUT_COOKIE)?.value;
  if (!raw) redirect('/checkout');
  let data: CheckoutData;
  try {
    data = JSON.parse(raw) as CheckoutData;
  } catch {
    redirect('/checkout');
  }

  const cart = await getCart();
  if (!cart || cart.items.length === 0) redirect('/cart');

  const user = await getSessionUser(); // null для гостя

  // Рубеж 1: проверка доступности по свежим данным из БД
  const products = await prisma.product.findMany({
    where: { id: { in: cart.items.map((i) => i.product.id) } },
    select: { id: true, supplierSku: true, name: true, brand: true, images: true, price: true, basePrice: true, stock: true, isActive: true, gism: true, category: { select: { name: true } } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const i of cart.items) {
    const p = byId.get(i.product.id);
    const problem = p ? checkPurchasable(p) : 'Товар не найден';
    if (problem) return { ok: false, error: `«${i.product.name}»: ${problem.toLowerCase()}. Обновите корзину.` };
  }

  const items = cart.items.map((i) => {
    const p = byId.get(i.product.id)!;
    const qty = clampQty(i.qty, p.stock);
    return {
      productId: p.id,
      sku: p.supplierSku,
      name: p.name,
      brand: p.brand,
      image: p.images[0] ?? '',
      price: p.price,
      basePrice: Number(p.basePrice), // числом: живая проверка ниже может обновить снимок
      qty,
    };
  });

  // Шаг 8: доставка считается ЗДЕСЬ, по данным БД — той же функцией и на тех же
  // данных, что видел покупатель на шаге подтверждения. Живая проверка ниже может
  // обновить закупку в снимке маржи, но цену доставки между экраном и оплатой
  // это менять не должно.
  const deliveryQuote = calcDelivery({
    method: data.deliveryMethod,
    city: data.city,
    items: cart.items.map((i) => {
      const p = byId.get(i.product.id)!;
      return {
        priceRub: Number(p.price),
        baseRub: Number(p.basePrice),
        qty: clampQty(i.qty, p.stock),
        categoryName: p.category?.name ?? '',
      };
    }),
  });

  // Рубеж 2 (7b): живые остатки у поставщика — ловим разобранное между синками.
  // Любая ошибка или таймаут → console.error и работаем по данным БД (fail-open):
  // чекаут не должен умирать вместе с API поставщика.
  try {
    const api = new AbsolutClient();
    const productIds = items
      .map((it) => Number(it.sku))
      .filter((n) => Number.isFinite(n) && n > 0);
    const answer = await Promise.race([
      api.availabilityAndPrice({ productIds }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('живая проверка: таймаут')), LIVE_CHECK_TIMEOUT_MS),
      ),
    ]);
    const bySku = new Map((answer ?? []).map((r) => [String(r.productId), r]));
    for (const it of items) {
      const r = bySku.get(it.sku);
      const fullName = [it.brand, it.name].filter(Boolean).join(' ');
      if (!r) {
        return { ok: false, error: `«${fullName}»: только что закончился у поставщика. Уберите товар из корзины.` };
      }
      const { quantity } = parseStock(r.stockQuantity ?? r.inStock);
      if (quantity < it.qty) {
        return {
          ok: false,
          error:
            quantity <= 0
              ? `«${fullName}»: только что закончился у поставщика. Уберите товар из корзины.`
              : `«${fullName}»: у поставщика осталось только ${quantity} шт. Уменьшите количество в корзине.`,
        };
      }
      // Живые данные есть — фиксируем в снимке закупку на момент оплаты (честная маржа).
      it.basePrice = purchasePriceWithVat(Number(r.price) || 0);
    }
  } catch (e) {
    console.error('[checkout] живая проверка у поставщика недоступна, работаем по данным БД:', e);
  }

  const itemsTotal = items.reduce((s, it) => s + Number(it.price) * it.qty, 0);
  const deliveryCost = deliveryQuote.costRub; // снимок в заказ; тарифы — src/lib/delivery/config.ts
  const total = itemsTotal + deliveryCost;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        number: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        userId: user?.id ?? null,
        customerName: data.customerName,
        phone: data.phone,
        email: data.email,
        deliveryMethod: data.deliveryMethod,
        city: data.deliveryMethod === 'courier' ? data.city : '',
        street: data.deliveryMethod === 'courier' ? data.street : '',
        house: data.deliveryMethod === 'courier' ? data.house : '',
        apartment: data.deliveryMethod === 'courier' ? data.apartment : '',
        entrance: data.deliveryMethod === 'courier' ? data.entrance : '',
        floor: data.deliveryMethod === 'courier' ? data.floor : '',
        intercom: data.deliveryMethod === 'courier' ? data.intercom : '',
        comment: data.comment,
        itemsTotal,
        deliveryCost,
        total,
        cartId: cart.id,
        items: { create: items },
      },
      select: { id: true },
    });
    const number = `LM-${String(created.id).padStart(6, '0')}`;
    const updated = await tx.order.update({
      where: { id: created.id },
      data: { number },
      select: { id: true, number: true, accessToken: true },
    });
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return updated;
  });

  jar.delete(CHECKOUT_COOKIE);
  // Корзину-контейнер оставляем (cookie lm_cart живёт дальше), позиции уже удалены.
  revalidatePath('/', 'layout');

  // Шаг 7: сразу создаём платёж и уводим покупателя на платёжную форму ЮKassa.
  // ВАЖНО: redirect() нельзя звать внутри try/catch (он работает через исключение),
  // поэтому здесь только собираем адрес, а redirect — один, в самом конце.
  let payUrl: string | null = null;
  let payFailed = false;
  if (isPaymentEnabled()) {
    try {
      const payment = await createOrderPayment({
        orderNumber: order.number,
        totalRub: total,
        returnUrl: `${siteUrl()}/order/${order.accessToken}`,
        customerPhone: data.phone,
        customerEmail: data.email || undefined,
        items: [
          ...items.map((it) => ({
            name: [it.brand, it.name].filter(Boolean).join(' '),
            priceRub: Number(it.price),
            qty: it.qty,
          })),
          // Чек 54-ФЗ обязан сходиться с суммой платежа копейка в копейку,
          // поэтому платная доставка — отдельной строкой (услуга).
          ...(deliveryCost > 0
            ? [{ name: 'Доставка', priceRub: deliveryCost, qty: 1, subject: 'service' as const }]
            : []),
        ],
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentId: payment.id, paymentStatus: payment.status },
      });
      payUrl = payment.confirmation?.confirmation_url ?? null;
    } catch (e) {
      // Заказ уже создан и не потеряется: покупатель попадёт на страницу заказа
      // с кнопкой «Оплатить» и пометкой, что оплата не запустилась.
      console.error('[checkout] не удалось создать платёж ЮKassa:', e);
      payFailed = true;
    }
  }

  redirect(payUrl ?? `/order/${order.accessToken}${payFailed ? '?payerror=1' : ''}`);
}
