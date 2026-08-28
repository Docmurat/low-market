export const dynamic = 'force-dynamic';

import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatPrice } from '@/lib/format';
import { formatAddress, formatPhone, ORDER_STATUS_LABEL } from '@/lib/checkout-shared';
import { setOrderStatus } from '../actions';

const dtFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const STATUS_ORDER = ['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled'];

export default async function AdminOrderPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { orderBy: { id: 'asc' }, include: { product: { select: { slug: true } } } },
      user: { select: { id: true, phone: true, name: true } },
    },
  });
  if (!order) notFound();

  // Маржа: (розница − закупка) × кол-во. basePrice — снимок закупки на момент заказа.
  const rows = order.items.map((it) => {
    const price = Number(it.price);
    const base = Number(it.basePrice);
    const margin = (price - base) * it.qty;
    return { ...it, priceNum: price, baseNum: base, margin };
  });
  const itemsTotal = Number(order.itemsTotal);
  const baseTotal = rows.reduce((s, r) => s + r.baseNum * r.qty, 0);
  const marginTotal = rows.reduce((s, r) => s + r.margin, 0);
  const marginPct = itemsTotal > 0 ? (marginTotal / itemsTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/orders" className="text-xs text-steel charge-link">← к списку заказов</Link>
          <h2 className="mt-1 text-xl font-bold font-mono">{order.number}</h2>
          <p className="text-xs text-steel">{dtFmt.format(order.createdAt)}</p>
        </div>
        <Link
          href={`/order/${order.accessToken}`}
          className="text-xs text-steel charge-link"
          target="_blank"
        >
          страница покупателя ↗
        </Link>
      </div>

      <section className="rounded-2xl bg-card border border-line p-5">
        <h3 className="mb-3 font-semibold">Статус: {ORDER_STATUS_LABEL[order.status] ?? order.status}</h3>
        <div className="flex flex-wrap gap-2">
          {STATUS_ORDER.map((s) => (
            <form key={s} action={setOrderStatus}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="status" value={s} />
              <button
                type="submit"
                disabled={s === order.status}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  s === order.status
                    ? 'bg-volt text-ink cursor-default'
                    : s === 'cancelled'
                      ? 'bg-gray-100 text-red-600 hover:bg-red-50'
                      : 'bg-gray-100 text-steel hover:bg-gray-200'
                }`}
              >
                {ORDER_STATUS_LABEL[s]?.split(' — ')[0] ?? s}
              </button>
            </form>
          ))}
        </div>
        <p className="mt-2 text-xs text-steel">
          Напоминание: заказ у поставщика пока НЕ создаётся (шаг 6c) — резервируйте вручную.
        </p>
      </section>

      <section className="rounded-2xl bg-card border border-line p-5">
        <h3 className="mb-3 font-semibold">Покупатель и доставка</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-[150px_1fr]">
          <dt className="text-steel">Имя</dt>
          <dd>
            {order.customerName}
            {order.user
              ? <span className="ml-1 text-xs text-steel">(аккаунт: {order.user.name || formatPhone(order.user.phone)})</span>
              : <span className="ml-1 text-xs text-steel">(гость)</span>}
          </dd>
          <dt className="text-steel">Телефон</dt>
          <dd className="font-semibold">{formatPhone(order.phone)}</dd>
          {order.email && (<><dt className="text-steel">Email</dt><dd>{order.email}</dd></>)}
          <dt className="text-steel">Доставка</dt>
          <dd>{order.deliveryMethod === 'courier' ? 'Курьером' : 'Самовывоз'}</dd>
          {order.deliveryMethod === 'courier' && (
            <><dt className="text-steel">Адрес</dt><dd>{formatAddress(order)}</dd></>
          )}
          {order.comment && (
            <><dt className="text-steel">Комментарий</dt><dd className="whitespace-pre-line">{order.comment}</dd></>
          )}
        </dl>
      </section>

      <section className="rounded-2xl bg-card border border-line overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-steel">
              <th className="px-4 py-3 font-medium" colSpan={2}>Товар</th>
              <th className="px-4 py-3 font-medium text-right">Закупка</th>
              <th className="px-4 py-3 font-medium text-right">Розница</th>
              <th className="px-4 py-3 font-medium text-right">Кол-во</th>
              <th className="px-4 py-3 font-medium text-right">Сумма</th>
              <th className="px-4 py-3 font-medium text-right">Маржа</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="py-2 pl-4">
                  <div className="relative h-12 w-12 rounded-lg bg-gray-50 overflow-hidden">
                    {r.image && (
                      <Image src={r.image} alt={r.name} fill className="object-contain p-1" sizes="48px" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="font-mono text-xs text-steel">{r.sku}</div>
                  {r.product ? (
                    <Link href={`/product/${r.product.slug}`} className="charge-link line-clamp-2" target="_blank">
                      {r.brand} {r.name}
                    </Link>
                  ) : (
                    <span className="line-clamp-2">{r.brand} {r.name} <span className="text-xs text-steel">(удалён из каталога)</span></span>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-steel">{formatPrice(r.baseNum)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatPrice(r.priceNum)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.qty}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatPrice(r.priceNum * r.qty)}</td>
                <td className={`px-4 py-2 text-right tabular-nums font-semibold ${r.margin < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  {formatPrice(r.margin)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td className="px-4 py-3" colSpan={2}>Итого</td>
              <td className="px-4 py-3 text-right tabular-nums text-steel">{formatPrice(baseTotal)}</td>
              <td className="px-4 py-3" />
              <td className="px-4 py-3" />
              <td className="px-4 py-3 text-right tabular-nums">{formatPrice(itemsTotal)}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${marginTotal < 0 ? 'text-red-600' : 'text-green-700'}`}>
                {formatPrice(marginTotal)} ({marginPct.toFixed(1)}%)
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
