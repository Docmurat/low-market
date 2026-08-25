export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import ProductCard from '@/components/ProductCard';

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const category = await prisma.category.findUnique({
    where: { slug: params.slug },
    include: { children: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!category) notFound();

  // Товары самой категории и всех её прямых подкатегорий
  const categoryIds = [category.id, ...category.children.map((c) => c.id)];
  const products = await prisma.product.findMany({
    where: { categoryId: { in: categoryIds }, isActive: true },
    orderBy: [{ stock: 'desc' }, { name: 'asc' }],
    take: 48, // пагинацию добавим на шаге 2
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-steel mb-4">
        <Link href="/" className="charge-link">Главная</Link>
        <span className="mx-2">/</span>
        <span className="text-ink font-medium">{category.name}</span>
      </nav>

      <h1 className="font-display text-2xl font-bold mb-6">{category.name}</h1>

      {category.children.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {category.children.map((c) => (
            <Link
              key={c.id}
              href={`/catalog/${c.slug}`}
              className="rounded-full border border-line bg-card px-4 py-1.5 text-sm font-medium hover:border-volt transition-colors"
            >
              {c.name}
            </Link>
          ))}
        </div>
      )}

      {products.length === 0 ? (
        <p className="text-steel">В этой категории пока нет товаров.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              slug={p.slug}
              name={p.name}
              brand={p.brand}
              price={p.price.toString()}
              stock={p.stock}
              image={p.images[0]}
              sku={p.supplierSku}
            />
          ))}
        </div>
      )}
    </div>
  );
}
