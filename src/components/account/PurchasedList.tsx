'use client';
/**
 * Покупки в ЛК (Шаг 9, решение владельца): две группы.
 *  «Последние покупки» — товары БЕЗ отзыва, всегда развёрнуты (призыв оценить).
 *  «Прошлые покупки»  — товары с отзывом, свёрнуты по умолчанию (клик — раскрыть);
 *                        там только звёзды: отзыв оставляется ОДИН РАЗ, правок нет
 *                        (решение владельца).
 * Форма отзыва раскрывается прямо под строкой — та же ReviewForm, что на карточке
 * товара. После сохранения server action ревалидирует /account, и товар сам
 * переезжает из «Последних» в «Прошлые».
 */
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ReviewForm from '@/components/product/ReviewForm';

export type PurchasedItem = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  image: string;
  myRating: number | null;
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-volt-dark" aria-label={`Оценка ${rating} из 5`}>
      {'★'.repeat(rating)}
      <span className="text-gray-300">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

function Row({
  p,
  open,
  onToggle,
}: {
  p: PurchasedItem;
  open: boolean;
  onToggle: () => void;
}) {
  const hasReview = p.myRating != null;
  return (
    <li className="rounded-2xl bg-card border border-line p-4">
      <div className="flex items-center gap-4">
        <div className="relative h-12 w-12 shrink-0 rounded-lg bg-gray-50 overflow-hidden">
          {p.image && <Image src={p.image} alt={p.name} fill className="object-contain p-1" sizes="48px" />}
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/product/${p.slug}`} className="charge-link text-sm line-clamp-2">
            {p.brand} {p.name}
          </Link>
          {hasReview && (
            <div className="mt-0.5 text-sm">
              <Stars rating={p.myRating!} />
            </div>
          )}
        </div>
        {!hasReview && (
          <button
            type="button"
            onClick={onToggle}
            className="shrink-0 rounded-lg bg-volt px-3 py-2 text-xs font-semibold text-ink hover:bg-volt-dark transition-colors"
          >
            {open ? 'Свернуть' : 'Оставить отзыв'}
          </button>
        )}
      </div>
      {open && !hasReview && (
        <div className="mt-3">
          <ReviewForm productId={p.id} />
        </div>
      )}
    </li>
  );
}

export default function PurchasedList({ items }: { items: PurchasedItem[] }) {
  const [openId, setOpenId] = useState<number | null>(null);
  const [showPast, setShowPast] = useState(false);

  const fresh = items.filter((p) => p.myRating == null); // без отзыва — на виду
  const past = items.filter((p) => p.myRating != null); // с отзывом — свёрнуты

  return (
    <div className="space-y-6">
      {fresh.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Последние покупки</h2>
          <ul className="space-y-2">
            {fresh.map((p) => (
              <Row key={p.id} p={p} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowPast(!showPast)}
            className="mb-4 flex items-center gap-2 text-lg font-semibold"
          >
            Прошлые покупки
            <span className="text-sm font-normal text-steel">· {past.length} с отзывом</span>
            <span className={`text-sm text-steel transition-transform ${showPast ? 'rotate-180' : ''}`}>▾</span>
          </button>
          {showPast && (
            <ul className="space-y-2">
              {past.map((p) => (
                <Row key={p.id} p={p} open={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
