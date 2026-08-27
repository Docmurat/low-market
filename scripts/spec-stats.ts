/**
 * Статистика характеристик по категории: какие ключи есть у товаров, как часто,
 * сколько уникальных значений. Нужна, чтобы выбрать фильтры для Шага 2.
 *
 * Запуск [VSCode терминал]:
 *   npx tsx scripts/spec-stats.ts noutbuki          — категория по slug (с подкатегориями)
 *   npx tsx scripts/spec-stats.ts noutbuki 40       — показать 40 ключей вместо 25
 *   npx tsx scripts/spec-stats.ts                   — по всем корневым категориям кратко
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function subtreeIds(rootId: number): Promise<number[]> {
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const ids = [rootId];
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of all) {
      if (c.parentId != null && ids.includes(c.parentId) && !ids.includes(c.id)) {
        ids.push(c.id);
        grew = true;
      }
    }
  }
  return ids;
}

async function statsFor(slug: string, top: number) {
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) {
    console.log(`Категория "${slug}" не найдена`);
    return;
  }
  const ids = await subtreeIds(cat.id);
  const products = await prisma.product.findMany({
    where: { categoryId: { in: ids }, isActive: true },
    select: { specs: true, brand: true },
  });
  const n = products.length;
  const keys = new Map<string, { count: number; values: Map<string, number> }>();
  const brands = new Map<string, number>();

  for (const p of products) {
    brands.set(p.brand, (brands.get(p.brand) ?? 0) + 1);
    const specs = (p.specs ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(specs)) {
      const e = keys.get(k) ?? { count: 0, values: new Map() };
      e.count++;
      e.values.set(v, (e.values.get(v) ?? 0) + 1);
      keys.set(k, e);
    }
  }

  const withSpecs = products.filter((p) => Object.keys((p.specs ?? {}) as object).length > 0).length;
  console.log(`\n=== ${cat.name} (${slug}) — товаров: ${n}, с характеристиками: ${withSpecs}, брендов: ${brands.size} ===`);
  console.log('ключ                                        | есть у % | уник.знач | примеры значений');
  const rows = [...keys.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, top);
  for (const [k, e] of rows) {
    const pct = Math.round((e.count / n) * 100);
    const topVals = [...e.values.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([v, c]) => `${v} (${c})`)
      .join(', ');
    console.log(`${k.padEnd(43).slice(0, 43)} | ${String(pct).padStart(7)}% | ${String(e.values.size).padStart(9)} | ${topVals.slice(0, 70)}`);
  }
    const attrs = await prisma.productAttribute.groupBy({
    by: ['key', 'value'],
    where: { product: { categoryId: { in: ids }, isActive: true } },
    _count: { _all: true },
    orderBy: [{ key: 'asc' }, { _count: { value: 'desc' } }],
  });
  console.log('\n--- нормализованные атрибуты (для фильтров) ---');
  let lastKey = '';
  for (const a of attrs) {
    if (a.key !== lastKey) {
      lastKey = a.key;
      console.log(`\n[${a.key}]`);
    }
    console.log(`   ${a.value} — ${a._count._all}`);
  }
}

async function main() {
  const slug = process.argv[2];
  const top = Number(process.argv[3] || 25);
  if (slug) {
    await statsFor(slug, top);
    return;
  }
  const roots = await prisma.category.findMany({ where: { parentId: null, isActive: true }, orderBy: { sortOrder: 'asc' } });
  for (const r of roots) await statsFor(r.slug, 8);
}

main().catch(console.error).finally(() => prisma.$disconnect());