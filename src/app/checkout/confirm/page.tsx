export const dynamic = 'force-dynamic';

import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCart } from '@/lib/cart';
import { formatPrice } from '@/lib/format';
import { CHECKOUT_COOKIE, DELIVERY_OPTIONS, formatAddress, formatPhone, type CheckoutData } from '@/lib/checkout-shared';
import { calcDelivery } from '@/lib/delivery/calc';
import PlaceOrderButton from '@/components/checkout/PlaceOrderButton';

export const metadata = { title: 'Подтверждение заказа' };

export default async function ConfirmPage() {
  const raw = cookies().get(CHECKOUT_COOKIE)?.value;
  if (!raw) redirect('/checkout');
  let data: CheckoutData;
  try {
    data = JSON.parse(raw) as CheckoutData;
  } catch {
    redirect('/checkout');
  }

  const cart = await getCart();
  if (!cart || cart.items.length === 0) redirect('/cart');

  const delivery = DELIVERY_OPTIONS.find((o) => o.value === data.deliveryMethod) ?? DELIVERY_OPTIONS[0];

  // Шаг 8: считаем доставку ТОЙ ЖЕ функцией и на ТЕХ ЖЕ данных (БД), что placeOrder, —
  // цифра на экране обязана совпасть с платежом. Закупка и категория берутся из БД.
  const forDelivery = await prisma.product.findMany({
    where: { id: { in: cart.items.map((i) => i.product.id) } },
    select: { id: true, price: true, basePrice: true, category: { select: { name: true } } },
  });
  const byId = new Map(forDelivery.map((p) => [p.id, p]));
  const quote = calcDelivery({
    method: data.deliveryMethod,
    city: data.city,
    items: cart.items.map((i) => {
      const p = byId.get(i.product.id);
      return {
        priceRub: p ? Number(p.price) : i.product.price,
        baseRub: p ? Number(p.basePrice) : i.product.price,
        qty: i.qty,
        categoryName: p?.category?.name ?? '',
      };
    }),
  });
  const totalToPay = cart.subtotal + quote.costRub;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-steel mb-6">
        <Link href="/" className="charge-link">Главная</Link>
        <span className="mx-2">/</span>
        <Link href="/cart" className="charge-link">Корзина</Link>
        <span className="mx-2">/</span>
        <Link href="/checkout" className="charge-link">Оформление</Link>
        <span className="mx-2">/</span>
        <span>Подтверждение</span>
      </nav>

      <div className="mb-6 flex items-center gap-3 text-sm">
        <span className="rounded-full bg-gray-100 px-3 py-1 text-steel">Шаг 1 · Контакты и доставка</span>
        <span className="text-steel">→</span>
        <span className="rounded-full bg-volt px-3 py-1 font-semibold text-ink">Шаг 2 · Проверка и подтверждение</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px] items-start">
        <div className="space-y-6">
          <section className="rounded-2xl bg-card border border-line p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Получатель и доставка</h2>
              <Link href="/checkout" className="text-xs text-steel charge-link">Изменить</Link>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
              <dt className="text-steel">Имя</dt><dd>{data.customerName}</dd>
              <dt className="text-steel">Телефон</dt><dd>{formatPhone(data.phone)}</dd>
              {data.email && (<><dt className="text-steel">Email</dt><dd>{data.email}</dd></>)}
              <dt className="text-steel">Доставка</dt><dd>{delivery.label}</dd>
              {data.deliveryMethod === 'courier' && (<><dt className="text-steel">Адрес</dt><dd>{formatAddress(data)}</dd></>)}
              {data.comment && (<><dt className="text-steel">Комментарий</dt><dd className="whitespace-pre-line">{data.comment}</dd></>)}
            </dl>
          </section>

          <section className="rounded-2xl bg-card border border-line px-6">
            <div className="flex items-center justify-between py-4">
              <h2 className="font-semibold">Состав заказа · {cart.count} шт.</h2>
              <Link href="/cart" className="text-xs text-steel charge-link">Изменить</Link>
            </div>
            <ul className="divide-y divide-line">
              {cart.items.map((i) => (
                <li key={i.id} className="flex gap-4 py-3 text-sm">
                  <div className="relative h-14 w-14 shrink-0 rounded-lg bg-gray-50 overflow-hidden">
                    {i.product.image && <Image src={i.product.image} alt={i.product.name} fill className="object-contain p-1" sizes="56px" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-steel">{i.product.sku}</div>
                    <div className="line-clamp-2">{i.product.brand} {i.product.name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold tabular-nums">{formatPrice(i.product.price * i.qty)}</div>
                    <div className="text-xs text-steel tabular-nums">{formatPrice(i.product.price)} × {i.qty}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="rounded-2xl bg-card border border-line p-6 lg:sticky lg:top-4">
          <h2 className="font-semibold mb-4">Итого</h2>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-steel">Товары</span>
            <span className="tabular-nums">{formatPrice(cart.subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm mb-4">
            <span className="text-steel">Доставка</span>
            {data.deliveryMethod === 'pickup' ? (
              <span className="text-steel">самовывоз — бесплатно</span>
            ) : quote.free ? (
              <span className="font-medium text-green-700">бесплатно</span>
            ) : (
              <span className="tabular-nums">{formatPrice(quote.costRub)}</span>
            )}
          </div>
          <div className="flex justify-between items-end border-t border-line pt-4 mb-5">
            <span className="font-semibold">К оплате</span>
            <span className="text-2xl font-bold tabular-nums">{formatPrice(totalToPay)}</span>
          </div>
          <PlaceOrderButton />
        </aside>
      </div>
    </div>
  );
}
