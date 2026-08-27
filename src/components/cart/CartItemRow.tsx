'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { formatPrice } from '@/lib/format';
import { setItemQty, removeItem } from '@/app/cart/actions';
import { MAX_QTY, type CartItemView } from '@/lib/cart-shared';

export default function CartItemRow({ item }: { item: CartItemView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const p = item.product;
  const maxQty = Math.min(MAX_QTY, p.stock > 0 ? p.stock : 1);
  const unavailable = !p.isActive || p.stock <= 0 || p.gism;

  function change(qty: number) {
    setError(null);
    startTransition(async () => {
      const res = await setItemQty(item.id, qty);
      if (!res.ok) setError(res.error);
    });
  }
  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await removeItem(item.id);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className={`flex gap-4 py-4 ${pending ? 'opacity-60' : ''}`}>
      <Link href={`/product/${p.slug}`} className="relative h-20 w-20 shrink-0 rounded-lg bg-gray-50 overflow-hidden">
        {p.image ? (
          <Image src={p.image} alt={p.name} fill className="object-contain p-1" sizes="80px" />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-gray-300">⚡</div>
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs text-steel">{p.sku}</div>
        <Link href={`/product/${p.slug}`} className="text-sm font-medium leading-snug hover:text-ink line-clamp-2">
          {p.brand && <span className="font-semibold">{p.brand} </span>}
          {p.name}
        </Link>
        {unavailable ? (
          <div className="mt-1 text-xs text-red-600">
            {p.gism ? 'Требуется маркировка — пока недоступен' : !p.isActive ? 'Снят с продажи' : 'Закончился на складе'} — удалите из корзины
          </div>
        ) : item.qty >= maxQty ? (
          <div className="mt-1 text-xs text-steel">Максимум по наличию: {maxQty} шт.</div>
        ) : null}
        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}

        <div className="mt-2 flex items-center gap-3">
          <div className="inline-flex items-center rounded-lg border border-line">
            <button
              type="button"
              onClick={() => change(item.qty - 1)}
              disabled={pending || item.qty <= 1}
              className="px-3 py-1.5 text-lg leading-none hover:bg-gray-50 disabled:opacity-40"
              aria-label="Меньше"
            >
              −
            </button>
            <span className="w-10 text-center text-sm font-semibold tabular-nums">{item.qty}</span>
            <button
              type="button"
              onClick={() => change(item.qty + 1)}
              disabled={pending || unavailable || item.qty >= maxQty}
              className="px-3 py-1.5 text-lg leading-none hover:bg-gray-50 disabled:opacity-40"
              aria-label="Больше"
            >
              +
            </button>
          </div>
          <button type="button" onClick={remove} disabled={pending} className="text-xs text-steel hover:text-red-600 charge-link">
            Удалить
          </button>
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="font-bold tabular-nums">{formatPrice(p.price * item.qty)}</div>
        {item.qty > 1 && <div className="text-xs text-steel tabular-nums">{formatPrice(p.price)} × {item.qty}</div>}
      </div>
    </div>
  );
}
