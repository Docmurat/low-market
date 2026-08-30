'use server';

/**
 * Server actions режима «Разбор фото» (/moder/review), пачечная версия.
 * Браузер копит вердикты по нескольким товарам и присылает их одной пачкой
 * после экрана подтверждения. До кнопки «Сохранить пачку» НИЧЕГО не удаляется.
 * redirect не используется — try/catch безопасны.
 */
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireModerator } from '@/lib/staff';
import { deleteFromStorageByUrl } from '@/lib/storage';

/** Один разобранный товар: что ОСТАВИТЬ (порядок исходный). */
export type BatchItem = { productId: number; keep: string[] };

export type ReviewResult = { ok: boolean; error?: string; saved?: number; removed?: number };

/** Предохранитель от неадекватно больших пачек. */
const MAX_ITEMS = 100;

export async function applyReviewBatch(
  items: BatchItem[],
  skippedIds: number[],
): Promise<ReviewResult> {
  await requireModerator();

  if (!Array.isArray(items) || !Array.isArray(skippedIds)) {
    return { ok: false, error: 'Некорректные данные пачки — обновите страницу.' };
  }
  if (items.length + skippedIds.length === 0) {
    return { ok: true, saved: 0, removed: 0 };
  }
  if (items.length + skippedIds.length > MAX_ITEMS) {
    return { ok: false, error: 'Слишком большая пачка — обновите страницу.' };
  }

  let saved = 0;
  let removedTotal = 0;
  const toDeleteFromBucket: string[] = [];

  for (const item of items) {
    const productId = Number(item.productId);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, slug: true, images: true },
    });
    if (!product) continue;

    // Доверяем только ссылкам, которые реально есть у товара; порядок — исходный
    const keepSet = new Set(Array.isArray(item.keep) ? item.keep : []);
    const kept = product.images.filter((u) => keepSet.has(u));
    const removed = product.images.filter((u) => !keepSet.has(u));

    await prisma.product.update({
      where: { id: product.id },
      data: {
        images: { set: kept },
        imagesLocked: true, // решение модератора — синк фото больше не трогает
        photoReviewStatus: 'done',
      },
    });
    revalidatePath(`/product/${product.slug}`);
    revalidatePath(`/moder/photos/${product.id}`);
    saved++;
    removedTotal += removed.length;
    toDeleteFromBucket.push(...removed);
  }

  for (const id of skippedIds) {
    const productId = Number(id);
    if (!Number.isInteger(productId) || productId <= 0) continue;
    await prisma.product
      .update({ where: { id: productId }, data: { photoReviewStatus: 'skipped' } })
      .catch(() => undefined); // товар мог исчезнуть — не критично
  }

  // Наши файлы в бакете подчищаем в конце; чужие ссылки функция пропустит сама
  for (const url of toDeleteFromBucket) {
    try {
      await deleteFromStorageByUrl(url);
    } catch {
      // не критично: из товара ссылка уже убрана
    }
  }

  revalidatePath('/moder/review');
  revalidatePath('/moder/photos');
  return { ok: true, saved, removed: removedTotal };
}