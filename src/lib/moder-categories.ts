/**
 * Категории для панели модерации: список для выпадашки и «умный» фильтр —
 * выбранная категория + ВСЕ её подкатегории (модератор включает «Ноутбуки»
 * и работает со всем, что внутри). Дерево маленькое (~400 узлов) — считаем в памяти.
 */
import { prisma } from '@/lib/db';

export type ModerCat = {
  id: number;
  name: string;
  parentId: number | null;
  supplierPath: string | null;
};

export async function loadModerCategories(): Promise<ModerCat[]> {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ supplierPath: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, parentId: true, supplierPath: true },
  });
}

/** Читаемая подпись категории в селекте. */
export function catLabel(c: ModerCat): string {
  return c.supplierPath ?? c.name;
}

/** id выбранной категории + всех её потомков. Неизвестный id → пустой список. */
export function subtreeIds(cats: ModerCat[], rootId: number): number[] {
  if (!cats.some((c) => c.id === rootId)) return [];
  const result = new Set<number>([rootId]);
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
