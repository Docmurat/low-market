/**
 * Строит таблицу ProductAttribute (нормализованные значения для фильтров)
 * из Product.specs по конфигу src/lib/filters/config.ts, и переносит
 * текстовое описание поставщика (specs.Description) в Product.description,
 * если у нас оно ещё пустое (защищённое поле).
 *
 * Запуск [VSCode терминал]:
 *   npx tsx scripts/build-attributes.ts              — все активные товары
 *   npx tsx scripts/build-attributes.ts noutbuki     — только поддерево категории (slug)
 *
 * Работает только с локальной базой, API не трогает. Идемпотентен: можно гонять
 * сколько угодно; вызывается автоматически в конце sync full/specs.
 */
import type { PrismaClient } from '@prisma/client';
import { filtersForChain } from '../src/lib/filters/config';
import { decodeHtmlEntities, normalize } from '../src/lib/filters/normalize';

export async function buildAttributes(prisma: PrismaClient, categorySlug?: string) {
  const cats = await prisma.category.findMany({ select: { id: true, slug: true, parentId: true } });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const chainOf = (id: number) => {
    const chain: string[] = [];
    let cur = byId.get(id);
    while (cur) {
      chain.push(cur.slug);
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  };

  let categoryIds: number[] | undefined;
  if (categorySlug) {
    const root = cats.find((c) => c.slug === categorySlug);
    if (!root) throw new Error(`Категория "${categorySlug}" не найдена`);
    categoryIds = [root.id];
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of cats) {
        if (c.parentId != null && categoryIds.includes(c.parentId) && !categoryIds.includes(c.id)) {
          categoryIds.push(c.id);
          grew = true;
        }
      }
    }
  }

  const products = await prisma.product.findMany({
    where: { isActive: true, ...(categoryIds ? { categoryId: { in: categoryIds } } : {}) },
    select: { id: true, brand: true, specs: true, description: true, categoryId: true },
    orderBy: { id: 'asc' },
  });

  let attrs = 0;
  let descriptions = 0;
  const started = Date.now();

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const specs = (p.specs ?? {}) as Record<string, string>;
    const filters = filtersForChain(chainOf(p.categoryId));

    const rows: { productId: number; key: string; value: string; numValue: number | null }[] = [];
    const seen = new Set<string>();
    for (const f of filters) {
      const raw = f.key === 'brand' ? p.brand : f.sources.map((s) => specs[s]).find((v) => v != null && v !== '');
      const n = normalize(f.normalize, raw);
      if (!n) continue;
      const dedupe = `${f.key}\u0000${n.value}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      rows.push({ productId: p.id, key: f.key, value: n.value, numValue: n.numValue ?? null });
    }

    // Описание поставщика → наше описание, только если у нас пусто
    let description: string | undefined;
    const supplierDesc = specs['Description'];
    if (!p.description && supplierDesc && supplierDesc.trim()) {
      description = decodeHtmlEntities(supplierDesc.trim());
    }

    await prisma.$transaction([
      prisma.productAttribute.deleteMany({ where: { productId: p.id } }),
      ...(rows.length ? [prisma.productAttribute.createMany({ data: rows })] : []),
      ...(description ? [prisma.product.update({ where: { id: p.id }, data: { description } })] : []),
    ]);
    attrs += rows.length;
    if (description) descriptions++;

    if ((i + 1) % 1000 === 0) console.log(`[attrs] ${i + 1}/${products.length}`);
  }

  console.log(
    `[attrs] товаров: ${products.length}, атрибутов: ${attrs}, описаний перенесено: ${descriptions}, ${Math.round((Date.now() - started) / 1000)} с`,
  );
}

if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  buildAttributes(prisma, process.argv[2])
    .catch((e) => {
      console.error('ОШИБКА:', e?.message ?? e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
