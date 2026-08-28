export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Админка · LOW-Market' };

/**
 * Каркас админки. requireAdmin() выполняется для КАЖДОЙ страницы раздела:
 * не вошёл → /account/login; вошёл, но не админ → на главную.
 * Пункты «скоро» включим в вехах 5.2 (заказы) и 5.3 (синк, товары).
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  const nav: { href: string | null; label: string }[] = [
    { href: '/admin', label: 'Сводка' },
    { href: '/admin/orders', label: 'Заказы' },
    { href: '/admin/sync', label: 'Синхронизация' },
    { href: '/admin/products', label: 'Товары' },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold font-display">
          Админка <span className="text-volt">·</span> LOW-Market
        </h1>
        <Link href="/" className="text-sm text-steel charge-link">← на сайт</Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-[200px_1fr] items-start">
        <nav className="rounded-2xl bg-card border border-line p-3 text-sm">
          <ul className="space-y-1">
            {nav.map((item) => (
              <li key={item.label}>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="block rounded-lg px-3 py-2 font-medium hover:bg-gray-50"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="block rounded-lg px-3 py-2 text-steel">
                    {item.label} <span className="text-xs">· скоро</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
