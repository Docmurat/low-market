export const dynamic = 'force-dynamic';

import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatPrice } from '@/lib/format';
import { setProductCategory, unlockProductCategory } from '../actions';

export default async function AdminProductPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [product, categories] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        supplierSku: true,
        slug: true,
        name: true,
        brand: true,
        price: true,
        stock: true,
        isActive: true,
        images: true,
        categoryId: true,
        categoryLocked: true,
        category: { select: { name: true, supplierPath: true } },
      },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ supplierPath: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, supplierPath: true, level: true },
    }),
  ]);
  if (!product) notFound();

  // В select кладём листовые и промежуточные категории с полным путём —
  // так видно, куда именно перекладываем («Комплектующие/Видеокарты/…»).
  const options = categories.map((c) => ({
    id: c.id,
    label: c.supplierPath ?? c.name,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/products" className="text-xs text-steel charge-link">← к поиску товаров</Link>
        <h2 className="mt-1 text-xl font-bold">
          <span className="font-mono text-steel">{product.supplierSku}</span> · {product.brand} {product.name}
        </h2>
      </div>

      <section className="rounded-2xl bg-card border border-line p-5">
        <div className="flex gap-5">
          <div className="relative h-24 w-24 shrink-0 rounded-lg bg-gray-50 overflow-hidden">
            {product.images[0] && (
              <Image src={product.images[0]} alt={product.name} fill className="object-contain p-1" sizes="96px" />
            )}
          </div>
          <dl className="grid flex-1 gap-2 text-sm sm:grid-cols-[140px_1fr]">
            <dt className="text-steel">Цена</dt>
            <dd className="tabular-nums font-semibold">{formatPrice(Number(product.price))}</dd>
            <dt className="text-steel">Остаток</dt>
            <dd className="tabular-nums">{product.stock}</dd>
            <dt className="text-steel">Активен</dt>
            <dd>{product.isActive ? 'да' : 'нет'}</dd>
            <dt className="text-steel">На витрине</dt>
            <dd>
              <Link href={`/product/${product.slug}`} className="charge-link" target="_blank">
                открыть карточку ↗
              </Link>
            </dd>
          </dl>
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-line p-5 space-y-4">
        <h3 className="font-semibold">Категория</h3>
        <p className="text-sm">
          Сейчас: <span className="font-semibold">{product.category.supplierPath ?? product.category.name}</span>
          {product.categoryLocked && (
            <span className="ml-2 rounded-full bg-volt/20 px-2 py-0.5 text-xs font-semibold">
              ручная · синк не трогает
            </span>
          )}
        </p>

        <form action={setProductCategory} className="space-y-3">
          <input type="hidden" name="productId" value={product.id} />
          <label className="block">
            <span className="text-sm text-steel">Переложить в категорию</span>
            <select
              name="categoryId"
              defaultValue={product.categoryId}
              className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 outline-none focus:ring-2 focus:ring-volt"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-lg bg-volt px-5 py-2.5 font-semibold text-ink hover:bg-volt-dark transition-colors"
          >
            Сохранить и защитить от синка
          </button>
          <p className="text-xs text-steel">
            После сохранения ставится защита: ночная синхронизация категорию этого товара
            больше не перезаписывает (цену и остаток обновляет как обычно).
          </p>
        </form>

        {product.categoryLocked && (
          <form action={unlockProductCategory} className="border-t border-line pt-4">
            <input type="hidden" name="productId" value={product.id} />
            <button
              type="submit"
              className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-gray-50 transition-colors"
            >
              Снять защиту (вернуть под управление синка)
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
