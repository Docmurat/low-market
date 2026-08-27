import Link from 'next/link';
import { SORTS, buildUrl, type SearchParams, type SortKey } from '@/lib/catalog/query';

type Props = { pathname: string; sp: SearchParams; current: SortKey; total: number };

export default function SortBar({ pathname, sp, current, total }: Props) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4 text-sm">
      <div className="text-steel">
        Найдено: <span className="font-semibold text-ink tabular-nums">{total}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {(Object.keys(SORTS) as SortKey[]).map((key) => (
          <Link
            key={key}
            href={buildUrl(pathname, sp, { sort: key === 'popular' ? null : key })}
            className={`rounded-full px-3 py-1 border transition-colors ${
              key === current ? 'bg-ink text-white border-ink' : 'border-line bg-card hover:border-volt'
            }`}
          >
            {SORTS[key].label}
          </Link>
        ))}
      </div>
    </div>
  );
}
