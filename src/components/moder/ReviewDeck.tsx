'use client';

/**
 * «Тиндер для фото», пачечная версия. Решения копятся в браузере:
 * ← плохое · → хорошее · ↓ пропустить товар · Backspace — назад (работает
 * сквозь границы товаров). На телефоне — свайп фото влево/вправо.
 * В конце пачки — экран подтверждения: все «плохие» миниатюрами, у каждого
 * «Вернуть»; удаление происходит ТОЛЬКО по кнопке «Сохранить пачку».
 * «Завершить пачку» — досрочно на подтверждение (недосмотренный товар
 * останется в очереди).
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyReviewBatch, type BatchItem } from '@/app/moder/review/actions';

type ReviewProduct = {
  id: number;
  supplierSku: string;
  name: string;
  brand: string;
  images: string[];
};

type Props = {
  products: ReviewProduct[];
  remaining: number; // товаров в очереди (включая пачку)
  skippedCount: number;
  inSkippedQueue: boolean;
};

type Verdict = 'good' | 'bad';
type HistoryEntry =
  | { kind: 'verdict'; pIdx: number; phIdx: number }
  | { kind: 'skip'; pIdx: number; phIdx: number; partial: Verdict[] };

export default function ReviewDeck({ products, remaining, skippedCount, inSkippedQueue }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pIdx, setPIdx] = useState(0);
  const [phIdx, setPhIdx] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<number, Verdict[]>>({});
  const [skipped, setSkipped] = useState<number[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Свайп на тач-экранах: тянем фото пальцем, за порогом — решение
  const [dragX, setDragX] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD = 80; // px до срабатывания

  const totalPhotos = products.reduce((s, p) => s + p.images.length, 0);
  const decided =
    Object.values(verdicts).reduce((s, v) => s + v.length, 0) +
    products.filter((p) => skipped.includes(p.id)).reduce((s, p) => s + p.images.length, 0);

  const product = products[pIdx];
  const current = product?.images[phIdx];

  const advance = (nextP: number) => {
    if (nextP >= products.length) {
      setConfirming(true);
    } else {
      setPIdx(nextP);
      setPhIdx(0);
    }
  };

  const decide = (v: Verdict) => {
    if (isPending || confirming || !product) return;
    setError(null);
    const list = [...(verdicts[product.id] ?? [])];
    list[phIdx] = v;
    setVerdicts({ ...verdicts, [product.id]: list });
    setHistory([...history, { kind: 'verdict', pIdx, phIdx }]);
    if (phIdx + 1 >= product.images.length) advance(pIdx + 1);
    else setPhIdx(phIdx + 1);
  };

  const skip = () => {
    if (isPending || confirming || !product) return;
    setError(null);
    setHistory([...history, { kind: 'skip', pIdx, phIdx, partial: verdicts[product.id] ?? [] }]);
    const rest = { ...verdicts };
    delete rest[product.id]; // недосмотренные вердикты этого товара сбрасываем
    setVerdicts(rest);
    setSkipped([...skipped, product.id]);
    advance(pIdx + 1);
  };

  const undo = () => {
    if (isPending || history.length === 0) return;
    setError(null);
    const entry = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setConfirming(false);
    const p = products[entry.pIdx];
    if (entry.kind === 'verdict') {
      const list = (verdicts[p.id] ?? []).slice(0, entry.phIdx);
      setVerdicts({ ...verdicts, [p.id]: list });
    } else {
      setSkipped(skipped.filter((id) => id !== p.id));
      setVerdicts({ ...verdicts, [p.id]: entry.partial });
    }
    setPIdx(entry.pIdx);
    setPhIdx(entry.phIdx);
  };

  /** На экране подтверждения: вернуть ошибочно забракованное фото. */
  const restore = (productId: number, index: number) => {
    if (isPending) return;
    const list = [...(verdicts[productId] ?? [])];
    if (list[index] !== 'bad') return;
    list[index] = 'good';
    setVerdicts({ ...verdicts, [productId]: list });
  };

  // Сохраняем только ПОЛНОСТЬЮ просмотренные товары; недосмотренный остаётся в очереди
  const doneProducts = products.filter(
    (p) => !skipped.includes(p.id) && (verdicts[p.id]?.length ?? 0) >= p.images.length,
  );
  const badOf = (p: ReviewProduct) =>
    p.images.map((url, i) => ({ url, i })).filter(({ i }) => verdicts[p.id]?.[i] === 'bad');
  const removedCount = doneProducts.reduce((s, p) => s + badOf(p).length, 0);
  const emptiedCount = doneProducts.filter((p) => badOf(p).length === p.images.length).length;

  const save = () => {
    if (isPending) return;
    const items: BatchItem[] = doneProducts.map((p) => ({
      productId: p.id,
      keep: p.images.filter((_, i) => verdicts[p.id]?.[i] === 'good'),
    }));
    startTransition(async () => {
      const res = await applyReviewBatch(items, skipped);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Не удалось сохранить — попробуйте ещё раз.');
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming) {
        if (e.key === 'Backspace') {
          e.preventDefault();
          undo();
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        decide('bad');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        decide('good');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        skip();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---------- свайп пальцем (телефон/планшет) ---------- */
  const onTouchStart = (e: React.TouchEvent) => {
    if (isPending || confirming) return;
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    // Вертикальное движение — это прокрутка страницы, не мешаем ей
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 10) return;
    setDragX(dx);
  };
  const onTouchEnd = () => {
    if (!touchStart.current) return;
    const dx = dragX;
    touchStart.current = null;
    setDragX(0);
    if (Math.abs(dx) >= SWIPE_THRESHOLD) decide(dx < 0 ? 'bad' : 'good');
  };

  /* ---------- экран подтверждения ---------- */
  if (confirming) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h3 className="text-lg font-bold">Проверка пачки перед сохранением</h3>
        <p className="text-sm text-steel">
          Товаров разобрано: <b className="tabular-nums">{doneProducts.length}</b> · пропущено:{' '}
          <b className="tabular-nums">{skipped.length}</b> · фото будет удалено:{' '}
          <b className="tabular-nums text-red-600">{removedCount}</b>
          {emptiedCount > 0 && (
            <>
              {' '}
              · останутся совсем без фото и <b>скроются с витрины</b>:{' '}
              <b className="tabular-nums">{emptiedCount}</b>
            </>
          )}
        </p>

        {removedCount === 0 ? (
          <p className="rounded-2xl border border-line bg-card p-5 text-sm text-steel">
            Ничего не удаляется — все просмотренные фото помечены хорошими.
          </p>
        ) : (
          <div className="space-y-3">
            {doneProducts.map((p) => {
              const bad = badOf(p);
              if (bad.length === 0) return null;
              return (
                <div key={p.id} className="rounded-2xl border border-line bg-card p-4">
                  <p className="mb-2 text-sm font-medium">
                    <span className="font-mono text-steel">{p.supplierSku}</span> · {p.brand}{' '}
                    {p.name}
                    {bad.length === p.images.length && (
                      <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        останется без фото
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {bad.map(({ url, i }) => (
                      <div key={url} className="w-24 text-center">
                        <div className="relative h-24 w-24 overflow-hidden rounded-lg border-2 border-red-200 bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`Удалится: фото ${i + 1}`}
                            className="absolute inset-0 h-full w-full object-contain p-1"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => restore(p.id, i)}
                          disabled={isPending}
                          className="mt-1 text-xs font-semibold text-green-700 charge-link"
                        >
                          ↩ Вернуть
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {skipped.length > 0 && (
          <p className="text-xs text-steel">
            Пропущенные (решим потом):{' '}
            {products
              .filter((p) => skipped.includes(p.id))
              .map((p) => p.supplierSku)
              .join(', ')}
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-xl bg-volt px-5 py-3 font-semibold text-ink hover:bg-volt-dark transition-colors disabled:opacity-50"
          >
            {isPending ? 'Сохраняем…' : `Сохранить пачку (${doneProducts.length + skipped.length})`}
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={isPending || history.length === 0}
            className="rounded-xl border border-line bg-white px-5 py-3 text-sm text-steel hover:bg-gray-50 transition-colors disabled:opacity-40"
          >
            ← Вернуться к разбору (Backspace)
          </button>
        </div>
        <p className="text-xs text-steel">
          До нажатия «Сохранить пачку» ничего не удаляется. «Вернуть» переводит фото обратно в
          хорошие.
        </p>
      </div>
    );
  }

  /* ---------- экран разбора ---------- */
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-medium">
          <span className="font-mono text-steel">{product.supplierSku}</span> · {product.brand}{' '}
          {product.name}
        </span>
        <span className="shrink-0 text-steel tabular-nums">
          фото {phIdx + 1}/{product.images.length} · пачка {decided}/{totalPhotos} · в очереди{' '}
          {remaining}
          {!inSkippedQueue && skippedCount > 0 ? ` · отложено ${skippedCount}` : ''}
        </span>
      </div>

      <div
        className="relative flex h-[420px] touch-pan-y select-none items-center justify-center overflow-hidden rounded-2xl border border-line bg-white"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
          setDragX(0);
        }}
      >
        {current ? (
          // Нарочно обычный <img>: битая ссылка честно покажется сломанной
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current}
            alt={`Фото ${phIdx + 1}`}
            draggable={false}
            className="max-h-full max-w-full object-contain"
            style={{
              transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)`,
              transition: dragX === 0 ? 'transform 150ms ease' : 'none',
            }}
          />
        ) : (
          <span className="text-steel">…</span>
        )}
        {/* Подсказки при свайпе */}
        {dragX < -20 && (
          <span
            className="pointer-events-none absolute left-4 top-4 rounded-lg border-2 border-red-400 px-3 py-1 text-lg font-bold text-red-500"
            style={{ opacity: Math.min(1, -dragX / SWIPE_THRESHOLD) }}
          >
            Плохое
          </span>
        )}
        {dragX > 20 && (
          <span
            className="pointer-events-none absolute right-4 top-4 rounded-lg border-2 border-green-500 px-3 py-1 text-lg font-bold text-green-600"
            style={{ opacity: Math.min(1, dragX / SWIPE_THRESHOLD) }}
          >
            Хорошее
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => decide('bad')}
          disabled={isPending}
          className="rounded-xl border-2 border-red-300 bg-white px-4 py-3 font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          ← Плохое
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={isPending || history.length === 0}
          className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-steel hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          ← Назад
          <span className="block text-xs">Backspace</span>
        </button>
        <button
          type="button"
          onClick={() => decide('good')}
          disabled={isPending}
          className="rounded-xl border-2 border-green-300 bg-white px-4 py-3 font-semibold text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
        >
          Хорошее →
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={skip}
          disabled={isPending}
          className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-steel hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          ↓ Пропустить товар
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={isPending || (decided === 0 && skipped.length === 0)}
          className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-steel hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          Завершить пачку сейчас
        </button>
      </div>

      <p className="mt-3 text-center text-xs text-steel">
        Клавиши: ← плохое · → хорошее · ↓ пропустить · Backspace — на фото назад (работает и
        через границу товара). На телефоне — свайп фото влево/вправо. Ничего не удаляется до
        кнопки «Сохранить пачку» на экране проверки.
      </p>
    </div>
  );
}