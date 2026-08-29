'use client';
/**
 * Форма отзыва (Шаг 9): звёзды 1–5 + текст. Показывается только покупателям
 * товара, ещё НЕ оставившим отзыв (решают Reviews.tsx и PurchasedList):
 * отзыв оставляется один раз, правок нет (решение владельца).
 */
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { submitReview, type ReviewFormState } from '@/app/reviews/actions';

// Начальное состояние живёт в клиенте ('use server'-файлы не экспортируют константы).
const INITIAL: ReviewFormState = { ok: false, message: '' };

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-volt px-5 py-2.5 text-sm font-semibold text-ink hover:bg-volt-dark transition-colors disabled:opacity-50"
    >
      {pending ? 'Сохраняем…' : 'Оставить отзыв'}
    </button>
  );
}

export default function ReviewForm({ productId }: { productId: number }) {
  const [state, action] = useFormState<ReviewFormState, FormData>(submitReview, INITIAL);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);

  return (
    <form action={action} className="mb-6 rounded-xl border border-line bg-card p-4 space-y-3">
      <div className="text-sm font-medium">Ваша оценка</div>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex gap-1 text-2xl" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            onMouseEnter={() => setHover(n)}
            aria-label={`${n} из 5`}
            className={`transition-colors ${(hover || rating) >= n ? 'text-volt-dark' : 'text-gray-300'}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        name="text"
        rows={4}
        maxLength={2000}
        placeholder="Чем товар понравился или не понравился, как показал себя в деле"
        className="w-full rounded-lg border border-line px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-volt"
      />
      {state.message && (
        <p className={`text-sm ${state.ok ? 'text-green-700' : 'text-red-600'}`}>{state.message}</p>
      )}
      <Submit />
    </form>
  );
}