export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatPrice } from '@/lib/format';

const PAGE_SIZE = 30;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: { q?: string; locked?: string; page?: string };
}) {
  const q = (searchParams.q ?? '').trim();
  const onlyLocked = searchParams.locked === '1';
  const page = Math.max(1, Number(searchParams.page) || 1);

  const where = {
    ...(q
      ? {
          OR: [
            { supplierSku: { contains: q, mode: 'insensitive' as const } },
            { name: { contains: q, mode: 'insensitive' as const } },
            { brand: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
    ...(onlyLocked ? { categoryLocked: true } : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        supplierSku: true,
        name: true,
        brand: true,
        price: true,
        stock: true,
        isActive: true,
        categoryLocked: true,
        category: { select: { name: true, supplierPath: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const baseQuery = `${q ? `q=${encodeURIComponent(q)}&` : ''}${onlyLocked ? 'locked=1&' : ''}`;
  const pageHref = (p: number) => `/admin/products?${baseQuery}page=${p}`;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-card border border-line p-5">
        <form action="/admin/products" className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={q}
            placeholder="Артикул, название или бренд…"
            className="min-w-[16rem] flex-1 rounded-lg border border-line px-3 py-2.5 outline-none focus:ring-2 focus:ring-volt"
          />
          {onlyLocked && <input type="hidden" name="locked" value="1" />}
          <button
            type="submit"
            className="rounded-lg bg-volt px-5 py-2.5 font-semibold text-ink hover:bg-volt-dark transition-colors"
          >
            Найти
          </button>
        </form>
        <div className="mt-3 text-xs">
          {onlyLocked ? (
            <Link href={`/admin/products${q ? `?q=${encodeURIComponent(q)}` : ''}`} className="charge-link text-steel">
              ✓ только с ручной категорией — показать все
            </Link>
          ) : (
            <Link href={`/admin/products?${q ? `q=${encodeURIComponent(q)}&` : ''}locked=1`} className="charge-link text-steel">
              показать только товары с ручной категорией
            </Link>
          )}
        </div>
      </div>

      {q === '' && !onlyLocked ? (
        <p className="rounded-2xl bg-card border border-line p-6 text-sm text-steel">
          Введите артикул или часть названия, чтобы найти товар и переложить его в другую категорию.
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-2xl bg-card border border-line p-6 text-sm text-steel">Ничего не найдено.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl bg-card border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-steel">
                  <th className="px-4 py-3 font-medium">Артикул</th>
                  <th className="px-4 py-3 font-medium">Товар</th>
                  <th className="px-4 py-3 font-medium">Категория</th>
                  <th className="px-4 py-3 font-medium text-right">Цена</th>
                  <th className="px-4 py-3 font-medium text-right">Остаток</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/products/${p.id}`} className="font-mono charge-link">
                        {p.supplierSku}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="line-clamp-2">
                        {p.brand} {p.name}
                        {!p.isActive && <span className="ml-1 text-xs text-steel">(неактивен)</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="line-clamp-1 text-steel">{p.category.supplierPath ?? p.category.name}</span>
                      {p.categoryLocked && (
                        <span className="mt-0.5 inline-block rounded-full bg-volt/20 px-2 py-0.5 text-xs font-semibold">
                          ручная · синк не трогает
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatPrice(Number(p.price))}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center gap-3 text-sm">
              {page > 1 && <Link href={pageHref(page - 1)} className="charge-link">← Назад</Link>}
              <span className="text-steel">Страница {page} из {pages} · всего {total}</span>
              {page < pages && <Link href={pageHref(page + 1)} className="charge-link">Вперёд →</Link>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
