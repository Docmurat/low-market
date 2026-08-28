export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatPrice } from '@/lib/format';
import { ORDER_STATUS_LABEL } from '@/lib/checkout-shared';

const dtFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Порядок статусов на сводке (как в жизненном цикле заказа). */
const STATUS_ORDER = ['new', 'confirmed', 'paid', 'shipped', 'done', 'cancelled'];

export default async function AdminDashboard() {
  const [byStatus, recentOrders, lastSync, productStats, userCount] = await Promise.all([
    prisma.order.groupBy({ by: ['status'], _count: { _all: true }, _sum: { total: true } }),
    prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, number: true, accessToken: true, status: true, total: true, customerName: true, createdAt: true },
    }),
    prisma.syncLog.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.product.aggregate({
      _count: { _all: true },
      where: {},
    }).then(async (all) => {
      const [active, inStock, gism] = await Promise.all([
        prisma.product.count({ where: { isActive: true } }),
        prisma.product.count({ where: { isActive: true, stock: { gt: 0 } } }),
        prisma.product.count({ where: { gism: true } }),
      ]);
      return { total: all._count._all, active, inStock, gism };
    }),
    prisma.user.count(),
  ]);

  const statusMap = new Map(byStatus.map((s) => [s.status, s]));
  const newOrders = statusMap.get('new')?._count._all ?? 0;

  return (
    <div className="space-y-8">
      {newOrders > 0 && (
        <div className="rounded-2xl border border-volt bg-volt/10 px-5 py-4 text-sm font-semibold">
          Новых заказов, ждущих подтверждения: {newOrders}
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Заказы по статусам</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STATUS_ORDER.map((status) => {
            const row = statusMap.get(status);
            const count = row?._count._all ?? 0;
            const sum = Number(row?._sum.total ?? 0);
            return (
              <div key={status} className="rounded-2xl bg-card border border-line p-4">
                <div className="text-xs text-steel">{ORDER_STATUS_LABEL[status] ?? status}</div>
                <div className="mt-1 flex items-end justify-between">
                  <span className="text-2xl font-bold tabular-nums">{count}</span>
                  {count > 0 && (
                    <span className="text-sm text-steel tabular-nums">{formatPrice(sum)}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Последние заказы</h2>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-steel">Заказов пока нет.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl bg-card border border-line">
            {recentOrders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/order/${o.accessToken}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm hover:bg-gray-50"
                >
                  <span className="font-mono font-semibold">{o.number}</span>
                  <span className="flex-1 min-w-0 truncate text-steel">{o.customerName}</span>
                  <span className="text-xs text-steel">{ORDER_STATUS_LABEL[o.status] ?? o.status}</span>
                  <span className="font-semibold tabular-nums">{formatPrice(Number(o.total))}</span>
                  <span className="text-xs text-steel">{dtFmt.format(o.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-steel">
          Полный список со сменой статусов — в разделе «Заказы» (следующая веха).
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-card border border-line p-5">
          <h2 className="mb-2 font-semibold">Каталог</h2>
          <dl className="grid grid-cols-[1fr_auto] gap-1 text-sm">
            <dt className="text-steel">Товаров всего</dt>
            <dd className="tabular-nums text-right">{productStats.total}</dd>
            <dt className="text-steel">Активных</dt>
            <dd className="tabular-nums text-right">{productStats.active}</dd>
            <dt className="text-steel">В наличии</dt>
            <dd className="tabular-nums text-right">{productStats.inStock}</dd>
            <dt className="text-steel">Честный ЗНАК (не продаём)</dt>
            <dd className="tabular-nums text-right">{productStats.gism}</dd>
            <dt className="text-steel">Пользователей</dt>
            <dd className="tabular-nums text-right">{userCount}</dd>
          </dl>
        </div>

        <div className="rounded-2xl bg-card border border-line p-5">
          <h2 className="mb-2 font-semibold">Последняя синхронизация</h2>
          {!lastSync ? (
            <p className="text-sm text-steel">Прогонов ещё не было.</p>
          ) : (
            <dl className="grid grid-cols-[1fr_auto] gap-1 text-sm">
              <dt className="text-steel">Режим</dt>
              <dd className="text-right font-mono">{lastSync.mode}</dd>
              <dt className="text-steel">Статус</dt>
              <dd
                className={`text-right font-semibold ${
                  lastSync.status === 'ok'
                    ? 'text-green-700'
                    : lastSync.status === 'error'
                      ? 'text-red-600'
                      : ''
                }`}
              >
                {lastSync.status}
              </dd>
              <dt className="text-steel">Начало</dt>
              <dd className="text-right">{dtFmt.format(lastSync.startedAt)}</dd>
              <dt className="text-steel">Обновлено товаров</dt>
              <dd className="tabular-nums text-right">{lastSync.updated}</dd>
              <dt className="text-steel">Ошибок</dt>
              <dd className="tabular-nums text-right">{lastSync.errors}</dd>
            </dl>
          )}
          <p className="mt-2 text-xs text-steel">
            Журнал прогонов и алерты — в разделе «Синхронизация» (веха 5.3).
          </p>
        </div>
      </section>
    </div>
  );
}
