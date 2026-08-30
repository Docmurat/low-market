/**
 * Подбор товаров для блоков на карточке:
 *   accessories — «С этим товаром покупают» по правилам src/lib/crosssell/config.ts;
 *   similar     — «Похожие товары»: та же категория, близкая цена (±40%), другие товары.
 *
 * Дерево категорий небольшое (~400), поэтому грузим его целиком одним запросом
 * и ищем совпадения в памяти. Витринное правило фото (src/lib/visibility.ts)
 * действует и здесь: товары без фото и без заглушки в блоки не попадают.
 */
import { prisma } from '@/lib/db';
import { photoVisibleWhere } from '@/lib/visibility';
import { CROSS_SELL_LIMIT, CROSS_SELL_RULES, SIMILAR_LIMIT, type CrossSellRule } from './config';

type Cat = { id: number; name: string; parentId: number | null; isActive: boolean };

const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  brand: true,
  price: true,
  stock: true,
  images: true,
  supplierSku: true,
  gism: true,
} as const;

export type CrossSellProduct = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  price: { toString(): string };
  stock: number;
  images: string[];
  supplierSku: string;
  gism: boolean;
};

export interface CrossSellResult {
  accessories: CrossSellProduct[];
  similar: CrossSellProduct[];
  ruleId: string | null;
}

let treeCache: { at: number; cats: Cat[] } | null = null;
async function loadTree(): Promise<Cat[]> {
  // Кэш на 5 минут: дерево меняется только при синке.
  if (treeCache && Date.now() - treeCache.at < 5 * 60_000) return treeCache.cats;
  const cats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true, isActive: true } });
  treeCache = { at: Date.now(), cats };
  return cats;
}

function chainNames(cats: Cat[], categoryId: number): string[] {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const names: string[] = [];
  let cur = byId.get(categoryId);
  while (cur) {
    names.push(cur.name);
    cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
  }
  return names;
}

/** Все id категорий, чьё имя подходит под regex, плюс их потомки. */
export function categoryIdsMatching(cats: Cat[], re: RegExp): number[] {
  const roots = cats.filter((c) => c.isActive && re.test(c.name.trim())).map((c) => c.id);
  const result = new Set<number>(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of cats) {
      if (c.parentId != null && result.has(c.parentId) && !result.has(c.id)) {
        result.add(c.id);
        grew = true;
      }
    }
  }
  return [...result];
}

export function findRule(cats: Cat[], categoryId: number): CrossSellRule | null {
  const names = chainNames(cats, categoryId);
  for (const rule of CROSS_SELL_RULES) {
    if (names.some((n) => rule.when.test(n.trim()))) return rule;
  }
  return null;
}

/** Небольшое перемешивание, чтобы блок не был одинаковым на всех карточках категории. */
function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function getCrossSell(product: { id: number; categoryId: number; price: { toString(): string } }): Promise<CrossSellResult> {
  const cats = await loadTree();
  const rule = findRule(cats, product.categoryId);
  const price = Number(product.price);

  let accessories: CrossSellProduct[] = [];
  if (rule) {
    // Из первых категорий правила берём больше, из последних — меньше, но всего CROSS_SELL_LIMIT.
    const perGroup = Math.max(2, Math.ceil(CROSS_SELL_LIMIT / rule.show.length) + 1);
    const seen = new Set<number>([product.id]);
    for (const re of rule.show) {
      if (accessories.length >= CROSS_SELL_LIMIT) break;
      const ids = categoryIdsMatching(cats, re);
      if (ids.length === 0) continue;
      const found = await prisma.product.findMany({
        where: {
          isActive: true,
          stock: { gt: 0 },
          gism: false,
          categoryId: { in: ids },
          id: { notIn: [...seen] },
          AND: [photoVisibleWhere],
        },
        select: productCardSelect,
        orderBy: [{ stock: 'desc' }, { price: 'asc' }],
        take: perGroup * 3, // берём с запасом и перемешиваем
      });
      for (const p of shuffle(found, product.id + accessories.length).slice(0, perGroup)) {
        if (accessories.length >= CROSS_SELL_LIMIT) break;
        seen.add(p.id);
        accessories.push(p);
      }
    }
  }

  const similarRaw = await prisma.product.findMany({
    where: {
      isActive: true,
      stock: { gt: 0 },
      categoryId: product.categoryId,
      id: { not: product.id },
      price: { gte: Math.floor(price * 0.6), lte: Math.ceil(price * 1.4) },
      AND: [photoVisibleWhere],
    },
    select: productCardSelect,
    orderBy: [{ stock: 'desc' }, { price: 'asc' }],
    take: SIMILAR_LIMIT * 3,
  });
  const similar = shuffle(similarRaw, product.id).slice(0, SIMILAR_LIMIT);

  return { accessories, similar, ruleId: rule?.id ?? null };
}
