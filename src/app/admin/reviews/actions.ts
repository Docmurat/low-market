'use server';
/**
 * Server actions раздела «Отзывы» админки (Шаг 9, постмодерация):
 * toggleReviewHidden — скрыть/вернуть отзыв. Скрытый не виден на витрине,
 * автор об этом не уведомляется; его правка отзыва скрытие не снимает.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export async function toggleReviewHidden(fd: FormData): Promise<void> {
  await requireAdmin(); // защита и на уровне action, не только страницы

  const reviewId = Number(fd.get('reviewId'));
  const back = String(fd.get('back') ?? '') === '1' ? '?hidden=1' : '';
  if (!Number.isInteger(reviewId) || reviewId <= 0) redirect('/admin/reviews');

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { isHidden: true, product: { select: { slug: true } } },
  });
  if (!review) redirect('/admin/reviews');

  await prisma.review.update({
    where: { id: reviewId },
    data: { isHidden: !review.isHidden },
  });

  revalidatePath(`/product/${review.product.slug}`); // витрина
  revalidatePath('/admin/reviews');
  redirect(`/admin/reviews${back}`);
}
