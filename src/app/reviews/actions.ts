'use server';
/**
 * Server action отзывов (Шаг 9): submitReview — оставить отзыв ОДИН РАЗ
 * (решение владельца: менять/переписывать отзыв нельзя, честная витрина).
 * Право писать: авторизован И покупал этот товар (заказ paid/shipped/done с этой
 * позицией по userId ИЛИ по телефону — та же логика, что «Мои заказы» в ЛК).
 * Постмодерация: новый отзыв виден сразу, админ может скрыть.
 */
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export type ReviewFormState = { ok: boolean; message: string };

const PAID_STATUSES = ['paid', 'shipped', 'done'];

export async function submitReview(_prev: ReviewFormState, fd: FormData): Promise<ReviewFormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Войдите в аккаунт, чтобы оставить отзыв.' };

  const productId = Number(fd.get('productId'));
  const rating = Number(fd.get('rating'));
  const text = String(fd.get('text') ?? '').trim().slice(0, 2000);

  if (!Number.isInteger(productId) || productId <= 0) {
    return { ok: false, message: 'Не удалось определить товар — обновите страницу.' };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, message: 'Поставьте оценку от 1 до 5 звёзд.' };
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  if (!product) return { ok: false, message: 'Товар не найден.' };

  // Подтверждённая покупка: оплаченный/доставленный/выполненный заказ с этим товаром.
  const bought = await prisma.orderItem.findFirst({
    where: {
      productId,
      order: {
        status: { in: PAID_STATUSES },
        OR: [{ userId: user.id }, { phone: user.phone }],
      },
    },
    select: { id: true },
  });
  if (!bought) {
    return { ok: false, message: 'Отзывы могут оставлять только покупатели этого товара.' };
  }

  // Один отзыв на товар, без правок. @@unique в схеме страхует от гонки двойной отправки.
  const existing = await prisma.review.findUnique({
    where: { productId_userId: { productId, userId: user.id } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, message: 'Вы уже оставили отзыв на этот товар — изменить его нельзя.' };
  }

  try {
    await prisma.review.create({
      data: { productId, userId: user.id, rating, text, authorName: user.name || 'Покупатель' },
    });
  } catch {
    // P2002 (двойной клик по кнопке) — отзыв уже создан первой отправкой.
    return { ok: false, message: 'Вы уже оставили отзыв на этот товар.' };
  }

  revalidatePath(`/product/${product.slug}`);
  revalidatePath('/account'); // форма теперь есть и в ЛК (блок «Ваши покупки»)
  return { ok: true, message: 'Спасибо! Отзыв сохранён.' };
}
