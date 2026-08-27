/**
 * Запросы каталога: разбор параметров URL, фильтры, сортировка, пагинация, фасеты.
 * Используется страницей категории и страницей поиска.
 *
 * URL-параметры:
 *   page=2                  страница (по 48 товаров)
 *   sort=price_asc|price_desc|new|popular   (popular по умолчанию: наличие → название)
 *   instock=1               только в наличии
 *   price_min=1000&price_max=50000
 *   <ключ фильтра>=<значение>   повторяется: ?brand=HONOR&brand=ACER  или  ?brand=HONOR,ACER
 *   <ключ range>_min / _max  для диапазонных фильтров (tdp_min=100&tdp_max=300)
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { filtersForChain, type FilterDef } from '@/lib/filters/config';

export const PAGE_SIZE = 48;

export type SearchParams = Record<string, string | string[] | undefined>;

export const SORTS = {
  popular: { label: 'По популярности', orderBy: [{ stock: 'desc' }, { name: 'asc' }] as Prisma.ProductOrderByWithRelationInput[] },
  price_asc: { label: 'Сначала дешевле', orderBy: [{ price: 'asc' }] as Prisma.ProductOrderByWithRelationInput[] },
  price_desc: { label: 'Сначала дороже', orderBy: [{ price: 'desc' }] as Prisma.ProductOrderByWithRelationInput[] },
  new: { label: 'Новинки', orderBy: [{ isNew: 'desc' }, { createdAt: 'desc' }] as Prisma.ProductOrderByWithRelationInput[] },
} as const;
export type SortKey = keyof typeof SORTS;

export function paramList(sp: SearchParams, key: string): string[] {
  const v = sp[key];
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
}
export function paramNum(sp: SearchParams, key: string): number | null {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface ParsedQuery {
  page: number;
  sort: SortKey;
  inStock: boolean;
  priceMin: number | null;
  priceMax: number | null;
  /** выбранные значения по ключам чекбокс-фильтров */
  selected: Record<string, string[]>;
  /** диапазоны по ключам range-фильтров */
  ranges: Record<string, { min: number | null; max: number | null }>;
}

export function parseQuery(sp: SearchParams, filters: FilterDef[]): ParsedQuery {
  const sortRaw = paramList(sp, 'sort')[0];
  const sort: SortKey = sortRaw && sortRaw in SORTS ? (sortRaw as SortKey) : 'popular';
  const selected: Record<string, string[]> = {};
  const ranges: Record<string, { min: number | null; max: number | null }> = {};
  for (const f of filters) {
    if (f.type === 'range') {
      const min = paramNum(sp, `${f.key}_min`);
      const max = paramNum(sp, `${f.key}_max`);
      if (min != null || max != null) ranges[f.key] = { min, max };
    } else {
      const vals = paramList(sp, f.key);
      if (vals.length) selected[f.key] = vals;
    }
  }
  return {
    page: Math.max(1, paramNum(sp, 'page') ?? 1),
    sort,
    inStock: paramList(sp, 'instock')[0] === '1',
    priceMin: paramNum(sp, 'price_min'),
    priceMax: paramNum(sp, 'price_max'),
    selected,
    ranges,
  };
}

/** Условие по атрибутам, исключая один ключ (для подсчёта фасетов этого ключа). */
function attributeConditions(q: ParsedQuery, exceptKey?: string): Prisma.ProductWhereInput[] {
  const out: Prisma.ProductWhereInput[] = [];
  for (const [key, values] of Object.entries(q.selected)) {
    if (key === exceptKey) continue;
    out.push({ attributes: { some: { key, value: { in: values } } } });
  }
  for (const [key, r] of Object.entries(q.ranges)) {
    if (key === exceptKey) continue;
    out.push({
      attributes: {
        some: { key, numValue: { ...(r.min != null ? { gte: r.min } : {}), ...(r.max != null ? { lte: r.max } : {}) } },
      },
    });
  }
  return out;
}

export function buildWhere(base: Prisma.ProductWhereInput, q: ParsedQuery, exceptKey?: string): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [base, { isActive: true }];
  if (q.inStock) and.push({ stock: { gt: 0 } });
  if (q.priceMin != null) and.push({ price: { gte: q.priceMin } });
  if (q.priceMax != null) and.push({ price: { lte: q.priceMax } });
  and.push(...attributeConditions(q, exceptKey));
  return { AND: and };
}

export interface FacetValue {
  value: string;
  count: number;
  numValue: number | null;
  selected: boolean;
}
export interface Facet {
  def: FilterDef;
  values: FacetValue[]; // для checkbox
  min?: number | null; // для range
  max?: number | null;
}

/** Фасеты: значения и счётчики по каждому фильтру с учётом остальных выбранных фильтров. */
export async function loadFacets(base: Prisma.ProductWhereInput, q: ParsedQuery, filters: FilterDef[]): Promise<Facet[]> {
  const facets: Facet[] = [];
  for (const def of filters) {
    const where = buildWhere(base, q, def.key);
    if (def.type === 'range') {
      const agg = await prisma.productAttribute.aggregate({
        where: { key: def.key, product: where },
        _min: { numValue: true },
        _max: { numValue: true },
      });
      if (agg._min.numValue == null) continue;
      facets.push({ def, values: [], min: agg._min.numValue, max: agg._max.numValue });
      continue;
    }
    const rows = await prisma.productAttribute.groupBy({
      by: ['value'],
      where: { key: def.key, product: where },
      _count: { _all: true },
      _min: { numValue: true },
    });
    if (rows.length < 2 && !(q.selected[def.key]?.length)) continue;
    const selected = new Set(q.selected[def.key] ?? []);
    const values: FacetValue[] = rows.map((r) => ({
      value: r.value,
      count: r._count._all,
      numValue: r._min.numValue,
      selected: selected.has(r.value),
    }));
    // Числовые значения — по возрастанию, остальные — по частоте
    const numeric = values.every((v) => v.numValue != null);
    values.sort((a, b) => (numeric ? (a.numValue ?? 0) - (b.numValue ?? 0) : b.count - a.count || a.value.localeCompare(b.value, 'ru')));
    facets.push({ def, values: values.slice(0, 40) });
  }
  return facets;
}

export async function loadProducts(base: Prisma.ProductWhereInput, q: ParsedQuery) {
  const where = buildWhere(base, q);
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: SORTS[q.sort].orderBy,
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: { id: true, slug: true, name: true, brand: true, price: true, rrp: true, stock: true, stockLabel: true, images: true, supplierSku: true },
    }),
  ]);
  return { total, items, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Все id поддерева категории + цепочка slug до корня (для конфига фильтров). */
export async function categoryScope(categoryId: number) {
  const cats = await prisma.category.findMany({ select: { id: true, slug: true, parentId: true } });
  const byId = new Map(cats.map((c) => [c.id, c]));
  const ids = [categoryId];
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of cats) {
      if (c.parentId != null && ids.includes(c.parentId) && !ids.includes(c.id)) {
        ids.push(c.id);
        grew = true;
      }
    }
  }
  const chain: string[] = [];
  let cur = byId.get(categoryId);
  while (cur) {
    chain.push(cur.slug);
    cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
  }
  return { ids, chain, filters: filtersForChain(chain) };
}

/** Условие поиска по строке: все слова должны встретиться в названии/бренде/артикуле/партномере/EAN. */
export function searchWhere(qs: string): Prisma.ProductWhereInput {
  const words = qs.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length === 0) return { id: -1 };
  const exact = qs.trim();
  return {
    OR: [
      { supplierSku: exact },
      { manufacturerCode: { equals: exact, mode: 'insensitive' } },
      { eanCodes: { has: exact } },
      {
        AND: words.map((w) => ({
          OR: [
            { name: { contains: w, mode: 'insensitive' } },
            { brand: { contains: w, mode: 'insensitive' } },
            { manufacturerCode: { contains: w, mode: 'insensitive' } },
          ],
        })),
      },
    ],
  };
}

/** Собрать URL с параметрами, переопределив часть; page сбрасывается, если не задан явно. */
export function buildUrl(pathname: string, sp: SearchParams, overrides: Record<string, string | string[] | null>): string {
  const params = new URLSearchParams();
  const merged: Record<string, string | string[] | null | undefined> = { ...sp, page: null, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (v == null || v === '') continue;
    for (const item of Array.isArray(v) ? v : [v]) params.append(k, item);
  }
  const s = params.toString();
  return s ? `${pathname}?${s}` : pathname;
}
