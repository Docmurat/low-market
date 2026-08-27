export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getCart } from '@/lib/cart';
import { formatPrice } from '@/lib/format';
import CartItemRow from '@/components/cart/CartItemRow';

export const metadata = { title: 'Корзина' };

export default async function CartPage() {
  const cart = await getCart();
  const items = cart?.items ?? [];
  const blocked = items.filter((i) => !i.product.isActive || i.product.stock <= 0 || i.product.gism);
  const canCheckout = items.length > 0 && blocked.length === 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-steel mb-6">
        <Link href="/" className="charge-link">Главная</Link>
        <span className="mx-2">/</span>
        <span>Корзина</span>
      </nav>
      <h1 className="font-display text-2xl font-bold mb-6">
        Корзина{cart && cart.count > 0 ? <span className="text-steel font-normal text-lg"> · {cart.count} шт.</span> : null}
      </h1>

      {items.length === 0 ? (
        <div className="rounded-2xl bg-card border border-line p-10 text-center">
          <div className="text-4xl mb-3">🛒</div>
          <p className="text-steel mb-6">В корзине пока пусто.</p>
          <Link href="/catalog/komplektuyushchie" className="inline-block rounded-lg bg-volt px-6 py-3 font-semibold text-ink hover:bg-volt-dark transition-colors">
            Перейти в каталог
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_340px] items-start">
          <div className="rounded-2xl bg-card border border-line px-6 divide-y divide-line">
            {items.map((i) => (
              <CartItemRow key={i.id} item={i} />
            ))}
          </div>

          <aside className="rounded-2xl bg-card border border-line p-6 lg:sticky lg:top-4">
            <h2 className="font-semibold mb-4">Итого</h2>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-steel">Товары, {cart!.count} шт.</span>
              <span className="tabular-nums">{formatPrice(cart!.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm mb-4">
              <span className="text-steel">Доставка</span>
              <span className="text-steel">рассчитаем при оформлении</span>
            </div>
            <div className="flex justify-between items-end border-t border-line pt-4 mb-5">
              <span className="font-semibold">К оплате</span>
              <span className="text-2xl font-bold tabular-nums">{formatPrice(cart!.subtotal)}</span>
            </div>
            {canCheckout ? (
              <Link href="/checkout" className="block w-full rounded-lg bg-volt py-3 text-center font-semibold text-ink hover:bg-volt-dark transition-colors">
                Оформить заказ
              </Link>
            ) : (
              <>
                <div className="w-full rounded-lg bg-gray-200 py-3 text-center font-semibold text-steel cursor-not-allowed">
                  Оформить заказ
                </div>
                <p className="mt-2 text-xs text-red-600">Удалите недоступные позиции, чтобы продолжить.</p>
              </>
            )}
            <p className="mt-3 text-xs text-steel">Оплата картой или СБП после подтверждения заказа. Доставка по Москве и МО за 1–2 рабочих дня.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
