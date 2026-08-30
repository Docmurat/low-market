export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { categoryScope, loadFacets, loadProducts, parseQuery, type SearchParams } from '@/lib/catalog/query';
import { photoVisibleWhere } from '@/lib/visibility';
import FilterSidebar from '@/components/catalog/FilterSidebar';
import SortBar from '@/components/catalog/SortBar';
import Pagination from '@/components/catalog/Pagination';
import ProductGrid from '@/components/catalog/ProductGrid';

export default async function CategoryPage({ params, searchParams }: { params: { slug: string }; searchParams: SearchParams }) {
  const category = await prisma.category.findUnique({
    where: { slug: params.slug },
    include: {
      parent: { include: { parent: true } },
      children: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
    },
  });
  if (!category) notFound();

  const pathname = `/catalog/${category.slug}`;
  const scope = await categoryScope(category.id);
  const q = parseQuery(searchParams, scope.filters);
  // Без фото и без заглушки товар на витрине не показываем (src/lib/visibility.ts)
  const base = { categoryId: { in: scope.ids }, AND: [photoVisibleWhere] };
  const [facets, result] = await Promise.all([loadFacets(base, q, scope.filters), loadProducts(base, q)]);

  const crumbs = [category.parent?.parent, category.parent].filter(Boolean) as { slug: string; name: string }[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-steel mb-4">
        <Link href="/" className="charge-link">Главная</Link>
        {crumbs.map((c) => (
          <span key={c.slug}>
            <span className="mx-2">/</span>
            <Link href={`/catalog/${c.slug}`} className="charge-link">{c.name}</Link>
          </span>
        ))}
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
              {c.productCount > 0 && <span className="ml-1 text-xs text-steel">{c.productCount}</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
                <aside className="lg:self-start">
          <FilterSidebar pathname={pathname} sp={searchParams} q={q} facets={facets} />
        </aside>
        <section>
          <SortBar pathname={pathname} sp={searchParams} current={q.sort} total={result.total} />
          <ProductGrid items={result.items} />
          <Pagination pathname={pathname} sp={searchParams} page={q.page} pages={result.pages} />
        </section>
      </div>
    </div>
  );
}
