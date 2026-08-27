export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { formatPrice } from '@/lib/format';
import { isHiddenSpec } from '@/lib/supplier/category-rules';
import { looksLikeHtml, sanitizeHtml } from '@/lib/html';
import Gallery from '@/components/product/Gallery';
import AddToCartButton from '@/components/cart/AddToCartButton';
import CrossSell from '@/components/product/CrossSell';

function stockText(stock: number, label: string | null): string {
  if (stock <= 0) return 'Под заказ · срок уточняйте';
  if (label) return `В наличии: много (${label}) · доставка 1–2 раб. дня`;
  return `В наличии: ${stock} шт. · доставка 1–2 раб. дня`;
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await prisma.product.findUnique({
    where: { slug: params.slug },
    include: { category: { include: { parent: { include: { parent: true } } } } },
  });
  if (!product || !product.isActive) notFound();

  const specs = Object.entries((product.specs ?? {}) as Record<string, string>).filter(([k, v]) => v && !isHiddenSpec(k));
  const crumbs = [product.category.parent?.parent, product.category.parent, product.category].filter(Boolean) as { slug: string; name: string }[];
  const price = Number(product.price);
  const rrp = product.rrp != null ? Number(product.rrp) : null;
  const discount = rrp && rrp > price ? Math.round((1 - price / rrp) * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-steel mb-6">
        <Link href="/" className="charge-link">Главная</Link>
        {crumbs.map((c) => (
          <span key={c.slug}>
            <span className="mx-2">/</span>
            <Link href={`/catalog/${c.slug}`} className="charge-link">{c.name}</Link>
          </span>
        ))}
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <Gallery images={product.images} alt={product.name} />

        <div>
          <div className="font-mono text-xs text-steel mb-2">
            Артикул: {product.supplierSku}
            {product.manufacturerCode && <> · P/N: {product.manufacturerCode}</>}
          </div>
          <h1 className="font-display text-2xl font-bold leading-tight">
            {product.brand} {product.name}
          </h1>

          <div className="mt-6 rounded-2xl bg-card border border-line p-6">
            <div className="flex items-end gap-3">
              <div className="text-3xl font-bold tabular-nums">{formatPrice(price)}</div>
              {discount > 0 && rrp && (
                <>
                  <div className="text-lg text-steel line-through tabular-nums">{formatPrice(rrp)}</div>
                  <div className="rounded-md bg-volt px-2 py-0.5 text-xs font-semibold text-ink">−{discount}%</div>
                </>
              )}
            </div>
            <div className={`mt-1 text-sm font-medium ${product.stock > 0 ? 'text-green-600' : 'text-steel'}`}>
              {stockText(product.stock, product.stockLabel)}
            </div>
            <div className="mt-4">
              <AddToCartButton productId={product.id} stock={product.stock} gism={product.gism} size="lg" />
            </div>
            <p className="mt-3 text-xs text-steel">
              {product.gism
                ? 'Товар подлежит обязательной маркировке «Честный ЗНАК» — откроем продажу после подключения ЭДО.'
                : 'Оплата: карта, СБП.'}
              {product.warrantyMonths ? ` Гарантия ${product.warrantyMonths} мес.` : ''}
            </p>
          </div>

          {specs.length > 0 && (
            <div className="mt-6">
              <h2 className="font-semibold mb-2">Характеристики</h2>
              <dl className="divide-y divide-line rounded-xl border border-line bg-card">
                {specs.map(([k, v]) => (
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

      {product.description && (
        <div className="mt-10 max-w-3xl">
          <h2 className="font-semibold mb-2">Описание</h2>
          {looksLikeHtml(product.description) ? (
            <div
              className="text-sm leading-relaxed text-gray-700 space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_h3]:font-semibold [&_h3]:mt-4"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(product.description) }}
            />
          ) : (
            <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">{product.description}</p>
          )}
        </div>
      )}

      <CrossSell product={{ id: product.id, categoryId: product.categoryId, price: product.price }} />
    </div>
  );
}
