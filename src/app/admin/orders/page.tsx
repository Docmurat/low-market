export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatPrice } from '@/lib/format';
import { formatPhone, ORDER_STATUS_LABEL } from '@/lib/checkout-shared';

const PAGE_SIZE = 30;

const dtFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Фильтры-вкладки: все + каждый статус. */
const TABS: { value: string; label: string }[] = [
  { value: '', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'confirmed', label: 'Подтверждённые' },
  { value: 'paid', label: 'Оплаченные' },
  { value: 'shipped', label: 'В доставке' },
  { value: 'done', label: 'Выполненные' },
  { value: 'cancelled', label: 'Отменённые' },
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}) {
  const status = searchParams.status && searchParams.status in ORDER_STATUS_LABEL ? searchParams.status : '';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const where = status ? { status } : {};

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        number: true,
        status: true,
        customerName: true,
        phone: true,
        total: true,
        createdAt: true,
        userId: true,
        _count: { select: { items: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabHref = (value: string) => (value ? `/admin/orders?status=${value}` : '/admin/orders');
  const pageHref = (p: number) =>
    `/admin/orders?${status ? `status=${status}&` : ''}page=${p}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={tabHref(t.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              status === t.value ? 'bg-volt text-ink' : 'bg-gray-100 text-steel hover:bg-gray-200'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="rounded-2xl bg-card border border-line p-6 text-sm text-steel">
          Заказов с таким статусом нет.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-card border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-steel">
                <th className="px-4 py-3 font-medium">Номер</th>
                <th className="px-4 py-3 font-medium">Дата</th>
                <th className="px-4 py-3 font-medium">Покупатель</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium text-right">Позиций</th>
                <th className="px-4 py-3 font-medium text-right">Сумма</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/orders/${o.id}`} className="font-mono font-semibold charge-link">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{dtFmt.format(o.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div>{o.customerName}{o.userId == null && <span className="ml-1 text-xs text-steel">(гость)</span>}</div>
                    <div className="text-xs text-steel">{formatPhone(o.phone)}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{ORDER_STATUS_LABEL[o.status] ?? o.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{o._count.items}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatPrice(Number(o.total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="charge-link">← Назад</Link>
          )}
          <span className="text-steel">
            Страница {page} из {pages} · всего {total}
          </span>
          {page < pages && (
            <Link href={pageHref(page + 1)} className="charge-link">Вперёд →</Link>
          )}
        </div>
      )}
    </div>
  );
}
