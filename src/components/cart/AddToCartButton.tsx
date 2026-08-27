'use client';
/**
 * Кнопка «В корзину». Используется на карточке товара (size="lg") и в сетке (size="sm").
 * Проверки дублируются на сервере в addToCart — здесь только для удобства пользователя.
 */
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { addToCart } from '@/app/cart/actions';

type Props = {
  productId: number;
  stock: number;
  gism?: boolean;
  size?: 'sm' | 'lg';
};

export default function AddToCartButton({ productId, stock, gism = false, size = 'lg' }: Props) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = stock <= 0 || gism || pending;
  const base =
    size === 'lg'
      ? 'w-full rounded-lg py-3 font-semibold'
      : 'w-full rounded-lg py-2 text-sm font-semibold';

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const res = await addToCart(productId, 1);
      if (res.ok) {
        setAdded(true);
      } else {
        setError(res.error);
      }
    });
  }

  if (gism) {
    return (
      <div className={`${base} bg-gray-100 text-steel text-center`} title="Обязательная маркировка «Честный ЗНАК»">
        Скоро в продаже
      </div>
    );
  }

  if (added) {
    return (
      <Link
        href="/cart"
        onClick={(e) => e.stopPropagation()}
        className={`${base} block text-center bg-ink text-white hover:bg-gray-800 transition-colors`}
      >
        В корзине → оформить
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${base} bg-volt text-ink hover:bg-volt-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {pending ? 'Добавляем…' : stock > 0 ? 'В корзину' : 'Нет в наличии'}
      </button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
