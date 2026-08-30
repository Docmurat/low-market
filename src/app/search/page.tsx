export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { loadFacets, loadProducts, parseQuery, searchWhere, type SearchParams } from '@/lib/catalog/query';
import { COMMON_FILTERS } from '@/lib/filters/config';
import { photoVisibleWhere } from '@/lib/visibility';
import FilterSidebar from '@/components/catalog/FilterSidebar';
import SortBar from '@/components/catalog/SortBar';
import Pagination from '@/components/catalog/Pagination';
import ProductGrid from '@/components/catalog/ProductGrid';

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const qs = (Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q)?.trim() ?? '';
  const pathname = '/search';

  if (!qs) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-2xl font-bold mb-4">Поиск</h1>
        <p className="text-steel">Введите название, бренд, артикул или партномер.</p>
      </div>
    );
  }

  // В поиске — только общие фильтры (бренд), характеристики зависят от категории
  const filters = COMMON_FILTERS;
  const q = parseQuery(searchParams, filters);
  // Без фото и без заглушки товар на витрине не показываем (src/lib/visibility.ts)
  const base = { AND: [searchWhere(qs), photoVisibleWhere] };
  const [facets, result] = await Promise.all([loadFacets(base, q, filters), loadProducts(base, q)]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-steel mb-4">
        <Link href="/" className="charge-link">Главная</Link>
        <span className="mx-2">/</span>
        <span className="text-ink font-medium">Поиск</span>
      </nav>
      <h1 className="font-display text-2xl font-bold mb-6">
        Результаты по запросу «{qs}»
      </h1>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <FilterSidebar pathname={pathname} sp={searchParams} q={q} facets={facets} keep={{ q: qs }} />
        </aside>
        <section>
          <SortBar pathname={pathname} sp={searchParams} current={q.sort} total={result.total} />
          <ProductGrid items={result.items} emptyText="По этому запросу ничего не нашлось. Попробуйте другое написание или артикул." />
          <Pagination pathname={pathname} sp={searchParams} page={q.page} pages={result.pages} />
        </section>
      </div>
    </div>
  );
}
