'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { saveCheckout, type CheckoutFormState } from '@/app/checkout/actions';
import { DELIVERY_OPTIONS, type CheckoutData, type CheckoutErrors, type DeliveryMethod } from '@/lib/checkout-shared';

function Field({
  label, name, defaultValue, error, placeholder, type = 'text', required, autoComplete, className = '',
}: {
  label: string; name: keyof CheckoutData; defaultValue: string; error?: string; placeholder?: string;
  type?: string; required?: boolean; autoComplete?: string; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm text-steel">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`mt-1 w-full rounded-lg border px-3 py-2.5 outline-none focus:ring-2 focus:ring-volt ${error ? 'border-red-500' : 'border-line'}`}
      />
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-volt py-3 font-semibold text-ink hover:bg-volt-dark transition-colors disabled:opacity-50"
    >
      {pending ? 'Сохраняем…' : 'Продолжить → проверка заказа'}
    </button>
  );
}

export default function CheckoutForm({ initial }: { initial: CheckoutData }) {
  const [state, action] = useFormState<CheckoutFormState, FormData>(saveCheckout, { errors: {}, values: null });
  const v: CheckoutData = state.values ?? initial;
  const e: CheckoutErrors = state.errors;
  const [method, setMethod] = useState<DeliveryMethod>(v.deliveryMethod);

  return (
    <form action={action} className="space-y-8">
      <section className="rounded-2xl bg-card border border-line p-6 space-y-4">
        <h2 className="font-semibold">1. Контакты</h2>
        <Field label="Имя" name="customerName" defaultValue={v.customerName} error={e.customerName} required autoComplete="name" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Телефон" name="phone" type="tel" defaultValue={v.phone} error={e.phone} placeholder="+7 999 123-45-67" required autoComplete="tel" />
          <Field label="Email" name="email" type="email" defaultValue={v.email} error={e.email} placeholder="для чека и статуса заказа" autoComplete="email" />
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-line p-6 space-y-4">
        <h2 className="font-semibold">2. Доставка</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {DELIVERY_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`cursor-pointer rounded-xl border p-4 transition-colors ${method === o.value ? 'border-volt bg-volt/10' : 'border-line hover:border-gray-400'}`}
            >
              <input
                type="radio"
                name="deliveryMethod"
                value={o.value}
                checked={method === o.value}
                onChange={() => setMethod(o.value)}
                className="mr-2 accent-volt"
              />
              <span className="font-medium">{o.label}</span>
              <span className="mt-1 block text-xs text-steel">{o.hint}</span>
            </label>
          ))}
        </div>

        {method === 'courier' && (
          <div className="space-y-4 pt-2">
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <Field label="Город" name="city" defaultValue={v.city} error={e.city} required autoComplete="address-level2" />
              <Field label="Улица" name="street" defaultValue={v.street} error={e.street} required autoComplete="address-line1" />
            </div>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
              <Field label="Дом" name="house" defaultValue={v.house} error={e.house} required />
              <Field label="Квартира" name="apartment" defaultValue={v.apartment} />
              <Field label="Подъезд" name="entrance" defaultValue={v.entrance} />
              <Field label="Этаж" name="floor" defaultValue={v.floor} />
              <Field label="Домофон" name="intercom" defaultValue={v.intercom} />
            </div>
          </div>
        )}

        <label className="block">
          <span className="text-sm text-steel">Комментарий к заказу</span>
          <textarea
            name="comment"
            defaultValue={v.comment}
            rows={3}
            placeholder="Удобное время, как найти подъезд, пожелания"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 outline-none focus:ring-2 focus:ring-volt"
          />
        </label>
      </section>

      <SubmitButton />
    </form>
  );
}
