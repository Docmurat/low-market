export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { toggleReviewHidden } from './actions';

const dtFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function AdminReviewsPage({ searchParams }: { searchParams: { [k: string]: string | undefined } }) {
  const showHidden = searchParams.hidden === '1';

  const reviews = await prisma.review.findMany({
    where: showHidden ? { isHidden: true } : {},
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      product: { select: { slug: true, name: true, brand: true } },
      user: { select: { phone: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">Отзывы</h2>
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/reviews"
            className={`rounded-full px-3 py-1.5 font-medium ${!showHidden ? 'bg-volt text-ink' : 'bg-gray-100 text-steel hover:bg-gray-200'}`}
          >
            Все
          </Link>
          <Link
            href="/admin/reviews?hidden=1"
            className={`rounded-full px-3 py-1.5 font-medium ${showHidden ? 'bg-volt text-ink' : 'bg-gray-100 text-steel hover:bg-gray-200'}`}
          >
            Скрытые
          </Link>
        </div>
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-steel">{showHidden ? 'Скрытых отзывов нет.' : 'Отзывов пока нет.'}</p>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className={`rounded-2xl border border-line p-4 ${r.isHidden ? 'bg-gray-50 opacity-80' : 'bg-card'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/product/${r.product.slug}#reviews`} target="_blank" className="charge-link text-sm font-medium line-clamp-1">
                    {r.product.brand} {r.product.name}
                  </Link>
                  <div className="mt-1 text-sm">
                    <span className="text-volt-dark">{'★'.repeat(r.rating)}</span>
                    <span className="text-gray-300">{'★'.repeat(5 - r.rating)}</span>
                    <span className="ml-2 font-medium">{r.authorName || 'Покупатель'}</span>
                    <span className="ml-2 text-xs text-steel">{r.user.phone}</span>
                    <span className="ml-2 text-xs text-steel">{dtFmt.format(r.createdAt)}</span>
                    {r.isHidden && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600">скрыт</span>}
                  </div>
                  {r.text && <p className="mt-2 text-sm whitespace-pre-line">{r.text}</p>}
                </div>
                <form action={toggleReviewHidden}>
                  <input type="hidden" name="reviewId" value={r.id} />
                  <input type="hidden" name="back" value={showHidden ? '1' : ''} />
                  <button
                    type="submit"
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      r.isHidden ? 'bg-volt text-ink hover:bg-volt-dark' : 'bg-gray-100 text-red-600 hover:bg-red-50'
                    }`}
                  >
                    {r.isHidden ? 'Показать' : 'Скрыть'}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
