'use server';
/**
 * Server actions чекаута.
 *  saveCheckout — шаг 1: валидирует форму, кладёт данные в cookie lm_checkout, ведёт на /checkout/confirm.
 *  placeOrder   — шаг 2: создаёт Order + OrderItem в транзакции, чистит корзину, ведёт на /order/<token>.
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

  // Финальная проверка доступности по свежим данным из БД
  const products = await prisma.product.findMany({
    where: { id: { in: cart.items.map((i) => i.product.id) } },
    select: { id: true, supplierSku: true, name: true, brand: true, images: true, price: true, basePrice: true, stock: true, isActive: true, gism: true },
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
      basePrice: p.basePrice,
      qty,
    };
  });
  const itemsTotal = items.reduce((s, it) => s + Number(it.price) * it.qty, 0);
  const deliveryCost = 0; // зоны и тарифы — шаг 8
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
    const updated = await tx.order.update({ where: { id: created.id }, data: { number }, select: { accessToken: true } });
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return updated;
  });

  jar.delete(CHECKOUT_COOKIE);
  // Корзину-контейнер оставляем (cookie lm_cart живёт дальше), позиции уже удалены.
  revalidatePath('/', 'layout');
  redirect(`/order/${order.accessToken}`);
}
