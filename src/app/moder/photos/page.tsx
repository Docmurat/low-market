export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { loadModerCategories, subtreeIds, catLabel } from '@/lib/moder-categories';

const PAGE_SIZE = 30;

type Search = { q?: string; cat?: string; page?: string; view?: string };

/** Ссылка на этот же список с сохранением вкладки/поиска/фильтра. */
function listUrl(params: Search, page: number, view?: string): string {
  const sp = new URLSearchParams();
  const v = view ?? params.view;
  if (v === 'stub') sp.set('view', 'stub');
  if (params.q) sp.set('q', params.q);
  if (params.cat) sp.set('cat', params.cat);
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `/moder/photos?${qs}` : '/moder/photos';
}

export default async function ModerPhotosPage({ searchParams }: { searchParams: Search }) {
  const q = (searchParams.q ?? '').trim();
  const catId = Number(searchParams.cat);
  const page = Math.max(1, Number(searchParams.page) || 1);
  const stubView = searchParams.view === 'stub';

  const cats = await loadModerCategories();

  // Скрытые: без фото и без заглушки (на витрине их НЕТ).
  // Заглушки: без фото, но опубликованы с заглушкой («сделаем позже»).
  const where: Prisma.ProductWhereInput = {
    isActive: true,
    images: { isEmpty: true },
    photoPlaceholder: stubView,
  };
  if (Number.isInteger(catId) && catId > 0) {
    const ids = subtreeIds(cats, catId); // категория + все подкатегории
    where.categoryId = ids.length > 0 ? { in: ids } : catId;
  }
  if (q) {
    where.OR = [
      { supplierSku: { contains: q } },
      { name: { contains: q, mode: 'insensitive' } },
      { brand: { contains: q, mode: 'insensitive' } },
    ];
  }

  const countWhere = (placeholder: boolean): Prisma.ProductWhereInput => ({
    isActive: true,
    images: { isEmpty: true },
    photoPlaceholder: placeholder,
  });

  const [hiddenTotal, stubTotal, total, products] = await Promise.all([
    prisma.product.count({ where: countWhere(false) }),
    prisma.product.count({ where: countWhere(true) }),
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ stock: 'desc' }, { id: 'asc' }], // сначала то, что реально продаётся
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        supplierSku: true,
        name: true,
        brand: true,
        stock: true,
        category: { select: { supplierPath: true, name: true } },
      },
    }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabBase = 'rounded-full px-4 py-1.5 text-sm font-medium border transition-colors';
  const tabOn = `${tabBase} border-volt bg-volt/20 text-ink`;
  const tabOff = `${tabBase} border-line bg-card text-steel hover:border-volt`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={listUrl({ ...searchParams, page: undefined }, 1, '')} className={stubView ? tabOff : tabOn}>
          Скрыты с витрины <span className="tabular-nums">({hiddenTotal})</span>
        </Link>
        <Link href={listUrl({ ...searchParams, page: undefined }, 1, 'stub')} className={stubView ? tabOn : tabOff}>
          Заглушки <span className="tabular-nums">({stubTotal})</span>
        </Link>
      </div>

      <p className="text-sm text-steel">
        {stubView
          ? 'Опубликованы БЕЗ фото, с картинкой-заглушкой — фото планируем добавить позже.'
          : 'Этих товаров НЕТ на витрине. Появятся после загрузки фото или публикации с заглушкой.'}
      </p>

      <form method="GET" action="/moder/photos" className="flex flex-wrap items-center gap-2">
        {stubView && <input type="hidden" name="view" value="stub" />}
        <input
          name="q"
          defaultValue={q}
          placeholder="Артикул, название или бренд"
          className="w-64 rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-volt"
        />
        <select
          name="cat"
          defaultValue={searchParams.cat ?? ''}
          className="max-w-xs rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-volt"
        >
          <option value="">Все категории</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {catLabel(c)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-ink hover:bg-volt-dark transition-colors"
        >
          Показать
        </button>
        <span className="text-sm text-steel">
          Найдено: <span className="font-semibold tabular-nums">{total}</span>
          {searchParams.cat ? ' (с подкатегориями)' : ''}
        </span>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-steel">
              <th className="px-4 py-3 font-medium">Артикул</th>
              <th className="px-4 py-3 font-medium">Товар</th>
              <th className="px-4 py-3 font-medium">Категория</th>
              <th className="px-4 py-3 font-medium text-right">Остаток</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-mono text-steel">{p.supplierSku}</td>
                <td className="px-4 py-3">
                  <Link href={`/moder/photos/${p.id}`} className="charge-link font-medium">
                    {p.brand} {p.name}
                  </Link>
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-steel">
                  {p.category.supplierPath ?? p.category.name}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{p.stock}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/moder/photos/${p.id}`}
                    className="rounded-lg bg-volt px-3 py-1.5 text-xs font-semibold text-ink hover:bg-volt-dark transition-colors"
                  >
                    Добавить фото
                  </Link>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-steel">
                  {total === 0 && !q && !searchParams.cat
                    ? stubView
                      ? 'Заглушек нет.'
                      : 'Скрытых товаров нет — все активные товары видны. Отличная работа!'
                    : 'Ничего не найдено — измените поиск или фильтр.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={listUrl(searchParams, page - 1)} className="charge-link">
              ← Назад
            </Link>
          ) : (
            <span />
          )}
          <span className="text-steel tabular-nums">
            Страница {page} из {pages}
          </span>
          {page < pages ? (
            <Link href={listUrl(searchParams, page + 1)} className="charge-link">
              Вперёд →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
