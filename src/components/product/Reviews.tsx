/**
 * Блок «Отзывы» на карточке товара (Шаг 9). Серверный компонент:
 * сам загружает видимые отзывы, среднюю оценку и решает, показывать ли форму
 * (только авторизованным покупателям товара — заказ paid/shipped/done).
 */
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import ReviewForm from '@/components/product/ReviewForm';

const dtFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-volt-dark tracking-tight" aria-label={`Оценка ${rating} из 5`}>
      {'★'.repeat(rating)}
      <span className="text-gray-300">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

export default async function Reviews({ productId }: { productId: number }) {
  const [reviews, user] = await Promise.all([
    prisma.review.findMany({
      where: { productId, isHidden: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    getSessionUser(),
  ]);

  // Может ли текущий пользователь писать отзыв (та же проверка, что в submitReview).
  let canReview = false;
  let own: { rating: number } | null = null;
  if (user) {
    const bought = await prisma.orderItem.findFirst({
      where: {
        productId,
        order: { status: { in: ['paid', 'shipped', 'done'] }, OR: [{ userId: user.id }, { phone: user.phone }] },
      },
      select: { id: true },
    });
    canReview = Boolean(bought);
    if (canReview) {
      const mine = await prisma.review.findUnique({
        where: { productId_userId: { productId, userId: user.id } },
        select: { rating: true },
      });
      if (mine) own = mine;
    }
  }

  const avg = reviews.length > 0 ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <section className="mt-10 max-w-3xl" id="reviews">
      <div className="flex flex-wrap items-baseline gap-3 mb-4">
        <h2 className="font-semibold text-lg">Отзывы</h2>
        {reviews.length > 0 ? (
          <span className="text-sm text-steel">
            <Stars rating={Math.round(avg)} /> {avg.toFixed(1)} · {reviews.length} шт.
          </span>
        ) : (
          <span className="text-sm text-steel">пока нет — станьте первым</span>
        )}
      </div>

      {canReview && own == null ? (
        <ReviewForm productId={productId} />
      ) : canReview && own != null ? (
        <p className="mb-6 rounded-xl border border-line bg-card px-4 py-3 text-sm">
          Ваш отзыв: <Stars rating={own.rating} /> — спасибо!
        </p>
      ) : (
        <p className="mb-6 rounded-xl border border-line bg-card px-4 py-3 text-sm text-steel">
          Отзывы могут оставлять покупатели этого товара{user ? '' : ' (войдите в аккаунт, если уже покупали)'}.
        </p>
      )}

      {reviews.length > 0 && (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{r.authorName || 'Покупатель'}</span>
                <span className="text-xs text-steel">{dtFmt.format(r.createdAt)}</span>
              </div>
              <div className="mt-0.5 text-sm"><Stars rating={r.rating} /></div>
              {r.text && <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{r.text}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}