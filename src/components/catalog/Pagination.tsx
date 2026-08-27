import Link from 'next/link';
import { buildUrl, type SearchParams } from '@/lib/catalog/query';

type Props = { pathname: string; sp: SearchParams; page: number; pages: number };

/** Страницы: 1 … 4 5 [6] 7 8 … 20 */
export default function Pagination({ pathname, sp, page, pages }: Props) {
  if (pages <= 1) return null;
  const items: (number | '…')[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) items.push(p);
    else if (items[items.length - 1] !== '…') items.push('…');
  }
  const link = (p: number) => buildUrl(pathname, sp, { page: p === 1 ? null : String(p) });
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1 text-sm" aria-label="Страницы">
      {page > 1 && (
        <Link href={link(page - 1)} className="rounded-lg border border-line px-3 py-1.5 hover:border-volt">
          ← Назад
        </Link>
      )}
      {items.map((it, i) =>
        it === '…' ? (
          <span key={`e${i}`} className="px-2 text-steel">
            …
          </span>
        ) : (
          <Link
            key={it}
            href={link(it)}
            className={`rounded-lg px-3 py-1.5 border tabular-nums ${it === page ? 'bg-ink text-white border-ink' : 'border-line hover:border-volt'}`}
          >
            {it}
          </Link>
        ),
      )}
      {page < pages && (
        <Link href={link(page + 1)} className="rounded-lg border border-line px-3 py-1.5 hover:border-volt">
          Вперёд →
        </Link>
      )}
    </nav>
  );
}
