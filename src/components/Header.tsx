import Link from 'next/link';
import { prisma } from '@/lib/db';
import { SITE_NAME } from '@/lib/site';

export default async function Header() {
  const rootCategories = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { sortOrder: 'asc' },
  });

  return (
    <header className="bg-ink text-white">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex items-center gap-6 py-4">
          <Link
            href="/"
            className="font-display text-2xl font-bold tracking-tight"
            aria-label={`${SITE_NAME} — на главную`}
          >
            LOW<span className="text-volt">-</span>Market
          </Link>

          <form action="/search" className="flex-1 max-w-2xl hidden sm:flex">
            <input
              name="q"
              placeholder="Искать среди 6000 товаров…"
              className="w-full rounded-l-lg px-4 py-2.5 text-ink outline-none focus:ring-2 focus:ring-volt"
            />
            <button
              type="submit"
              className="rounded-r-lg bg-volt px-5 font-semibold text-ink hover:bg-volt-dark transition-colors"
            >
              Найти
            </button>
          </form>

          <nav className="ml-auto flex items-center gap-5 text-sm font-medium">
            <Link href="/cart" className="charge-link">
              Корзина
            </Link>
            <Link href="/account" className="charge-link">
              Войти
            </Link>
          </nav>
        </div>

        <nav className="flex gap-6 overflow-x-auto pb-3 text-sm text-gray-300">
          {rootCategories.map((c) => (
            <Link
              key={c.id}
              href={`/catalog/${c.slug}`}
              className="charge-link whitespace-nowrap hover:text-white"
            >
              {c.name}
            </Link>
          ))}
        </nav>
      </div>
      <div className="bg-volt text-ink text-center text-xs font-semibold py-1.5">
        Доставка по Москве и МО за 1–2 рабочих дня · Оплата картой и СБП
      </div>
    </header>
  );
}
