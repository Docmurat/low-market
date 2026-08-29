'use client';
/**
 * Кнопка «Оплатить заказ» на странице заказа покупателя (шаг 7).
 * Отправляет server action payForOrder — тот создаёт платёж в ЮKassa
 * и перебрасывает покупателя на платёжную форму.
 */
import { useFormStatus } from 'react-dom';
import { payForOrder } from '@/app/order/[token]/actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-volt px-6 py-3 font-semibold text-ink hover:bg-volt-dark transition-colors disabled:opacity-50"
    >
      {pending ? 'Переходим к оплате…' : 'Оплатить заказ'}
    </button>
  );
}

export default function PayOrderButton({ token }: { token: string }) {
  return (
    <form action={payForOrder}>
      <input type="hidden" name="token" value={token} />
      <Submit />
    </form>
  );
}
