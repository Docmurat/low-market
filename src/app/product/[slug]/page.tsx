export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { prisma } from '@/lib/db';
import { formatPrice } from '@/lib/format';

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: { category: true },
  });
  if (!product || !product.isActive) notFound();

  const specs = product.specs as Record<string, string>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-steel mb-6">
        <Link href="/" className="charge-link">Главная</Link>
        <span className="mx-2">/</span>
        <Link href={`/catalog/${product.category.slug}`} className="charge-link">
          {product.category.name}
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-square rounded-2xl bg-card border border-line overflow-hidden">
          {product.images[0] ? (
            <Image
              src={product.images[0]}
              alt={product.name}
              fill
              className="object-contain p-8"
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
            />
          ) : (
            <div className="flex h-full items-center justify-center text-8xl text-gray-200">⚡</div>
          )}
        </div>

        <div>
          <div className="font-mono text-xs text-steel mb-2">Артикул: {product.supplierSku}</div>
          <h1 className="font-display text-2xl font-bold leading-tight">
            {product.brand} {product.name}
          </h1>

          <div className="mt-6 rounded-2xl bg-card border border-line p-6">
            <div className="text-3xl font-bold tabular-nums">{formatPrice(product.price.toString())}</div>
            <div className={`mt-1 text-sm font-medium ${product.stock > 0 ? 'text-green-600' : 'text-steel'}`}>
              {product.stock > 0 ? `В наличии: ${product.stock} шт. · доставка 1–2 раб. дня` : 'Под заказ'}
            </div>
            <button
              className="mt-4 w-full rounded-lg bg-volt py-3 font-semibold text-ink hover:bg-volt-dark transition-colors"
              disabled={product.stock === 0}
            >
              В корзину
            </button>
            <p className="mt-3 text-xs text-steel">
              Корзина заработает на шаге 3. Оплата: карта, СБП. Товар — Ростест, официальная гарантия.
            </p>
          </div>

          {product.description && (
            <div className="mt-6">
              <h2 className="font-semibold mb-2">Описание</h2>
              <p className="text-sm leading-relaxed text-gray-700">{product.description}</p>
            </div>
          )}

          {Object.keys(specs).length > 0 && (
            <div className="mt-6">
              <h2 className="font-semibold mb-2">Характеристики</h2>
              <dl className="divide-y divide-line rounded-xl border border-line bg-card">
                {Object.entries(specs).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
                    <dt className="text-steel">{k}</dt>
                    <dd className="font-medium text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
