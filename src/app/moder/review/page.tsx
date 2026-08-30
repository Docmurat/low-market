export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { loadModerCategories, subtreeIds, catLabel } from '@/lib/moder-categories';
import ReviewDeck from '@/components/moder/ReviewDeck';

/** Размер пачки разбора: добираем ЦЕЛЫЕ товары, пока не наберётся столько фото. */
const BATCH_PHOTOS = 50;
/** Предохранитель на случай товаров по 1 фото. */
const BATCH_MAX_PRODUCTS = 40;

/**
 * Разбор фото пачками: решения копятся в браузере и применяются одной кнопкой
 * «Сохранить пачку» после экрана подтверждения (там можно «Вернуть» ошибочно
 * забракованные). Очереди: основная и «Отложенные» (?queue=skipped).
 * Фильтр по категории (?cat=) — выбранная + подкатегории. Ходовые — первыми.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: { queue?: string; cat?: string };
}) {
  const skippedQueue = searchParams.queue === 'skipped';
  const status = skippedQueue ? 'skipped' : 'none';
  const catId = Number(searchParams.cat);

  const cats = await loadModerCategories();

  const baseWhere: Prisma.ProductWhereInput = { isActive: true, images: { isEmpty: false } };
  if (Number.isInteger(catId) && catId > 0) {
    const ids = subtreeIds(cats, catId);
    baseWhere.categoryId = ids.length > 0 ? { in: ids } : catId;
  }

  const [remaining, skippedCount, candidates] = await Promise.all([
    prisma.product.count({ where: { ...baseWhere, photoReviewStatus: status } }),
    prisma.product.count({ where: { ...baseWhere, photoReviewStatus: 'skipped' } }),
    prisma.product.findMany({
      where: { ...baseWhere, photoReviewStatus: status },
      orderBy: [{ stock: 'desc' }, { id: 'asc' }],
      take: BATCH_MAX_PRODUCTS,
      select: { id: true, supplierSku: true, name: true, brand: true, images: true },
    }),
  ]);

  // Пачка: целые товары, пока не наберём ~BATCH_PHOTOS фото
  const batch: typeof candidates = [];
  let photos = 0;
  for (const p of candidates) {
    batch.push(p);
    photos += p.images.length;
    if (photos >= BATCH_PHOTOS) break;
  }

  const catParam = searchParams.cat ? `&cat=${encodeURIComponent(searchParams.cat)}` : '';

  return (
    <div className="space-y-4">
      <form method="GET" action="/moder/review" className="flex flex-wrap items-center gap-2">
        {skippedQueue && <input type="hidden" name="queue" value="skipped" />}
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
          Работать в категории
        </button>
        {searchParams.cat && <span className="text-xs text-steel">включая подкатегории</span>}
        {skippedQueue && (
          <Link
            href={`/moder/review${searchParams.cat ? `?cat=${encodeURIComponent(searchParams.cat)}` : ''}`}
            className="ml-auto text-sm charge-link"
          >
            ← к основной очереди
          </Link>
        )}
      </form>

      {batch.length === 0 ? (
        <div className="rounded-2xl border border-line bg-card p-8 text-center">
          <p className="text-lg font-semibold">
            {skippedQueue
              ? 'Отложенных товаров нет' + (searchParams.cat ? ' в этой категории' : '')
              : 'Очередь разбора пуста 🎉' + (searchParams.cat ? ' (в этой категории)' : '')}
          </p>
          <div className="mt-4 space-x-4 text-sm">
            {!skippedQueue && skippedCount > 0 && (
              <Link
                href={`/moder/review?queue=skipped${catParam}`}
                className="charge-link text-volt font-semibold"
              >
                Разобрать отложенные ({skippedCount})
              </Link>
            )}
            {searchParams.cat && (
              <Link
                href={skippedQueue ? '/moder/review?queue=skipped' : '/moder/review'}
                className="charge-link"
              >
                Снять фильтр категории
              </Link>
            )}
            <Link href="/moder/photos" className="charge-link">
              К товарам без фото
            </Link>
          </div>
        </div>
      ) : (
        <>
          {skippedQueue && <p className="text-sm text-steel">Очередь «Отложенные».</p>}
          {/* key по первому товару: после сохранения пачки состояние сбрасывается */}
          <ReviewDeck
            key={batch[0].id}
            products={batch}
            remaining={remaining}
            skippedCount={skippedCount}
            inSkippedQueue={skippedQueue}
          />
        </>
      )}
    </div>
  );
}