export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { formatPhone, ORDER_STATUS_LABEL } from '@/lib/checkout-shared';
import { formatPrice } from '@/lib/format';
import { logout } from './actions';

export const metadata = { title: 'Личный кабинет' };

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

function statusBadge(status: string): string {
  const base = 'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold';
  if (status === 'cancelled') return `${base} bg-red-50 text-red-700`;
  if (status === 'done') return `${base} bg-green-50 text-green-700`;
  if (status === 'new') return `${base} bg-gray-100 text-steel`;
  return `${base} bg-volt/20 text-ink`;
}

/**
 * Личный кабинет: данные аккаунта + «Мои заказы».
 * Заказы ищем по userId ИЛИ по телефону аккаунта — так подтягиваются
 * и гостевые заказы, оформленные на этот номер до регистрации.
 * Страница заказа — существующая /order/<accessToken>.
 */
export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect('/account/login');

  const orders = await prisma.order.findMany({
    where: { OR: [{ userId: user.id }, { phone: user.phone }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      number: true,
      accessToken: true,
      status: true,
      total: true,
      createdAt: true,
      _count: { select: { items: true } },
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="text-sm text-steel mb-6">
        <Link href="/" className="charge-link">Главная</Link>
        <span className="mx-2">/</span>
        <span>Личный кабинет</span>
      </nav>

      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold font-display">
          {user.name ? `Здравствуйте, ${user.name}!` : 'Личный кабинет'}
        </h1>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition-colors"
          >
            Выйти
          </button>
        </form>
      </div>

      <section className="rounded-2xl bg-card border border-line p-6 mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Профиль</h2>
          <Link href="/account/profile" className="text-xs text-steel charge-link">Изменить</Link>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-[140px_1fr]">
          <dt className="text-steel">Телефон</dt>
          <dd className="font-semibold">{formatPhone(user.phone)}</dd>
          <dt className="text-steel">Email</dt>
          <dd>{user.email ?? <span className="text-steel">не указан</span>}</dd>
          <dt className="text-steel">Пароль</dt>
          <dd>
            {user.hasPassword ? (
              'задан — можно входить по email и паролю'
            ) : (
              <span className="text-steel">не задан — вход по SMS</span>
            )}
          </dd>
        </dl>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Мои заказы · {orders.length}</h2>

        {orders.length === 0 ? (
          <div className="rounded-2xl bg-card border border-line p-6 text-sm text-steel">
            Заказов пока нет.{' '}
            <Link href="/" className="charge-link text-ink font-semibold">Перейти в каталог</Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/order/${o.accessToken}`}
                  className="block rounded-2xl bg-card border border-line p-5 hover:border-volt transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-semibold">{o.number}</span>
                      <span className={statusBadge(o.status)}>
                        {ORDER_STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </div>
                    <span className="font-bold tabular-nums">{formatPrice(Number(o.total))}</span>
                  </div>
                  <div className="mt-1.5 text-xs text-steel">
                    {dateFmt.format(o.createdAt)} · товаров: {o._count.items}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
