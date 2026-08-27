'use client';

import { useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Facet, ParsedQuery, SearchParams } from '@/lib/catalog/query';

type Props = {
  pathname: string;
  sp: SearchParams;
  q: ParsedQuery;
  facets: Facet[];
  /** параметры, которые надо сохранить (напр. q для поиска) */
  keep?: Record<string, string>;
};

/**
 * Панель фильтров. Галочки применяются сразу (обновляем URL — страница
 * перерисовывается на сервере, значения, которых больше нет, исчезают).
 * Поля «от/до» применяются по Enter или кнопке — чтобы не дёргать список на каждую цифру.
 * Без JavaScript всё равно работает как обычная GET-форма.
 */
export default function FilterSidebar({ pathname, sp, q, facets, keep = {} }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  const hasAny =
    q.inStock || q.priceMin != null || q.priceMax != null || Object.keys(q.selected).length > 0 || Object.keys(q.ranges).length > 0;
  const sort = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;

  function apply() {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form).entries()) {
      if (typeof v === 'string' && v !== '') params.append(k, v);
    }
    const s = params.toString();
    startTransition(() => router.push(s ? `${pathname}?${s}` : pathname, { scroll: false }));
  }

  const inputCls = 'w-full rounded-lg border border-line px-3 py-1.5 outline-none focus:ring-2 focus:ring-volt';

  return (
    <form
    key={JSON.stringify(sp)}
      ref={formRef}
      method="get"
      action={pathname}
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className={`space-y-6 text-sm transition-opacity ${pending ? 'opacity-60' : ''}`}
    >
      {sort && <input type="hidden" name="sort" value={sort} />}
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <fieldset>
        <legend className="font-semibold mb-2">Цена, ₽</legend>
        <div className="flex gap-2">
          <input type="number" name="price_min" placeholder="от" defaultValue={q.priceMin ?? ''} className={inputCls} />
          <input type="number" name="price_max" placeholder="до" defaultValue={q.priceMax ?? ''} className={inputCls} />
        </div>
        <label className="mt-3 flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="instock" value="1" checked={q.inStock} onChange={apply} className="accent-volt" />
          Только в наличии
        </label>
      </fieldset>

      {facets.map((f) =>
        f.def.type === 'range' ? (
          <fieldset key={f.def.key}>
            <legend className="font-semibold mb-2">{f.def.label}</legend>
            <div className="flex gap-2">
              <input
                type="number"
                name={`${f.def.key}_min`}
                placeholder={`от ${Math.floor(f.min ?? 0)}`}
                defaultValue={q.ranges[f.def.key]?.min ?? ''}
                className={inputCls}
              />
              <input
                type="number"
                name={`${f.def.key}_max`}
                placeholder={`до ${Math.ceil(f.max ?? 0)}`}
                defaultValue={q.ranges[f.def.key]?.max ?? ''}
                className={inputCls}
              />
            </div>
          </fieldset>
        ) : (
          <fieldset key={f.def.key}>
            <legend className="font-semibold mb-2">{f.def.label}</legend>
            <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
              {f.values.map((v) => (
                <label key={v.value} className="flex items-center gap-2 cursor-pointer hover:text-ink">
                  <input
                    type="checkbox"
                    name={f.def.key}
                    value={v.value}
                                        checked={v.selected}
                    onChange={apply}
                    className="accent-volt"
                  />
                  <span className="flex-1 truncate" title={v.value}>
                    {v.value}
                  </span>
                  <span className="text-xs text-steel tabular-nums">{v.count}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ),
      )}

      <div className="flex gap-2 pt-2">
        <button type="submit" className="flex-1 rounded-lg bg-volt py-2 font-semibold text-ink hover:bg-volt-dark transition-colors">
          Применить цену
        </button>
        {hasAny && (
          <Link
            href={pathname + (keep.q ? `?q=${encodeURIComponent(keep.q)}` : '')}
            className="rounded-lg border border-line px-3 py-2 text-steel hover:border-volt"
          >
            Сбросить
          </Link>
        )}
      </div>
    </form>
  );
}