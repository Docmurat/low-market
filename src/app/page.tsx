export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { photoVisibleWhere } from '@/lib/visibility';
import ProductCard from '@/components/ProductCard';

export default async function HomePage() {
  const [categories, popular] = await Promise.all([
    prisma.category.findMany({ where: { parentId: null }, orderBy: { sortOrder: 'asc' } }),
    prisma.product.findMany({
      where: { isActive: true, stock: { gt: 0 }, AND: [photoVisibleWhere] },
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4">
      {/* Hero: тезис магазина */}
      <section className="my-8 rounded-2xl bg-ink text-white px-8 py-12 relative overflow-hidden">
        <div className="absolute right-0 top-0 h-full w-1/3 bg-volt/10 skew-x-[-12deg] translate-x-16" />
        <h1 className="font-display text-3xl sm:text-5xl font-bold max-w-3xl leading-tight">
          Техника по ценам, за которыми к нам приходят{' '}
          <span className="text-volt">магазины</span>
        </h1>
        <p className="mt-4 max-w-xl text-gray-300">
          Мы — субдистрибьютор. 6000 позиций компьютерной и бытовой техники со склада,
          доставка по Москве и МО за 1–2 рабочих дня.
        </p>
        <Link
          href="/catalog/komplektuyushchie"
          className="mt-8 inline-block rounded-lg bg-volt px-6 py-3 font-semibold text-ink hover:bg-volt-dark transition-colors"
        >
          Смотреть каталог
        </Link>
      </section>

      {/* Категории */}
      <section className="my-10">
        <h2 className="font-display text-xl font-bold mb-4">Категории</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/catalog/${c.slug}`}
              className="rounded-xl bg-card border border-line px-4 py-5 font-medium hover:border-volt hover:shadow transition-all"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {/* Новые поступления */}
      <section className="my-10">
        <h2 className="font-display text-xl font-bold mb-4">Новые поступления</h2>
        {popular.length === 0 ? (
          <p className="text-steel">
            Каталог пуст. Выполните <code className="font-mono">npm run seed</code>, чтобы
            загрузить демо-товары.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {popular.map((p) => (
              <ProductCard
                key={p.id}
                id={p.id}
                slug={p.slug}
                name={p.name}
                brand={p.brand}
                price={p.price.toString()}
                stock={p.stock}
                image={p.images[0]}
                sku={p.supplierSku}
                gism={p.gism}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
