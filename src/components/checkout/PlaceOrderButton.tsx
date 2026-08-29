'use client';
import { useState, useTransition } from 'react';
import { placeOrder } from '@/app/checkout/actions';

export default function PlaceOrderButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    setError(null);
    startTransition(async () => {
      // При успехе action делает redirect (на платёжную форму ЮKassa
      // или на страницу заказа) и сюда не возвращается.
      const res = await placeOrder();
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="w-full rounded-lg bg-volt py-3 font-semibold text-ink hover:bg-volt-dark transition-colors disabled:opacity-50"
      >
        {pending ? 'Оформляем…' : 'Подтвердить и оплатить'}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <p className="mt-3 text-xs text-steel">
        Нажимая кнопку, вы соглашаетесь с условиями продажи и обработкой персональных данных.
        После подтверждения вы перейдёте к безопасной оплате (ЮKassa) — заказ возьмём
        в работу сразу после оплаты.
      </p>
    </div>
  );
}
