export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCart } from '@/lib/cart';
import { formatPrice } from '@/lib/format';
import { CHECKOUT_COOKIE, EMPTY_CHECKOUT, type CheckoutData } from '@/lib/checkout-shared';
import CheckoutForm from '@/components/checkout/CheckoutForm';

export const metadata = { title: 'Оформление заказа' };

function readSaved(): CheckoutData {
  const raw = cookies().get(CHECKOUT_COOKIE)?.value;
  if (!raw) return EMPTY_CHECKOUT;
  try {
    return { ...EMPTY_CHECKOUT, ...(JSON.parse(raw) as Partial<CheckoutData>) };
  } catch {
    return EMPTY_CHECKOUT;
  }
}

export default async function CheckoutPage() {
  const cart = await getCart();
  if (!cart || cart.items.length === 0) redirect('/cart');
  const blocked = cart.items.some((i) => !i.product.isActive || i.product.stock <= 0 || i.product.gism);
  if (blocked) redirect('/cart');

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-steel mb-6">
        <Link href="/" className="charge-link">Главная</Link>
        <span className="mx-2">/</span>
        <Link href="/cart" className="charge-link">Корзина</Link>
        <span className="mx-2">/</span>
        <span>Оформление</span>
      </nav>

      <div className="mb-6 flex items-center gap-3 text-sm">
        <span className="rounded-full bg-volt px-3 py-1 font-semibold text-ink">Шаг 1 · Контакты и доставка</span>
        <span className="text-steel">→</span>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-steel">Шаг 2 · Проверка и подтверждение</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px] items-start">
        <CheckoutForm initial={readSaved()} />

        <aside className="rounded-2xl bg-card border border-line p-6 lg:sticky lg:top-4">
          <h2 className="font-semibold mb-3">Ваш заказ</h2>
          <ul className="divide-y divide-line text-sm">
            {cart.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3 py-2">
                <span className="line-clamp-2">{i.product.brand} {i.product.name} <span className="text-steel">× {i.qty}</span></span>
                <span className="tabular-nums shrink-0">{formatPrice(i.product.price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-between items-end border-t border-line pt-4">
            <span className="font-semibold">Товары, {cart.count} шт.</span>
            <span className="text-xl font-bold tabular-nums">{formatPrice(cart.subtotal)}</span>
          </div>
          <Link href="/cart" className="mt-3 inline-block text-xs text-steel charge-link">Изменить состав</Link>
        </aside>
      </div>
    </div>
  );
}
