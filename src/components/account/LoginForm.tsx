'use client';
/**
 * Форма входа: две вкладки.
 *  «По телефону» — шаг 1 (номер → запрос кода), шаг 2 (ввод кода из SMS).
 *  «Email и пароль» — для тех, кто задал пароль в профиле.
 * Вся проверка — на сервере (src/app/account/login/actions.ts), здесь только UI.
 */
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  requestCode,
  verifyCode,
  loginWithPassword,
  type PhoneLoginState,
  type EmailLoginState,
} from '@/app/account/login/actions';
import { CODE_LENGTH } from '@/lib/auth-shared';
import { formatPhone } from '@/lib/checkout-shared';

const PHONE_INITIAL: PhoneLoginState = { phase: 'phone', phone: '', error: null, notice: null };
// ВАЖНО: начальная фаза формы ПРОВЕРКИ кода — 'code'. На 'phone' она меняется,
// только если сервер ответил «сессия кода потерялась» — тогда возвращаемся к номеру.
const VERIFY_INITIAL: PhoneLoginState = { phase: 'code', phone: '', error: null, notice: null };
const EMAIL_INITIAL: EmailLoginState = { email: '', error: null };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-volt py-3 font-semibold text-ink hover:bg-volt-dark transition-colors disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export default function LoginForm() {
  const [tab, setTab] = useState<'phone' | 'email'>('phone');
  // Позволяет вернуться к вводу номера с шага кода («Изменить номер»).
  const [forcePhoneInput, setForcePhoneInput] = useState(false);

  const [reqState, reqAction] = useFormState<PhoneLoginState, FormData>(requestCode, PHONE_INITIAL);
  const [verState, verAction] = useFormState<PhoneLoginState, FormData>(verifyCode, VERIFY_INITIAL);

  const [emailState, emailAction] = useFormState<EmailLoginState, FormData>(loginWithPassword, EMAIL_INITIAL);

  // Если verifyCode вернул фазу 'phone' (сессия кода потерялась) — тоже показываем ввод номера.
  // Шаг кода показываем, когда код запрошен успешно и сервер не «уронил» сессию кода.
  const showCodeStep =
    !forcePhoneInput && reqState.phase === 'code' && verState.phase === 'code';
  const phoneError = reqState.error ?? (verState.phase === 'phone' ? verState.error : null);

  const tabClass = (active: boolean) =>
    `flex-1 rounded-lg py-2 text-sm font-semibold transition-colors ${
      active ? 'bg-volt text-ink' : 'bg-gray-100 text-steel hover:bg-gray-200'
    }`;

  return (
    <div className="rounded-2xl bg-card border border-line p-6">
      <div className="mb-6 flex gap-2">
        <button type="button" className={tabClass(tab === 'phone')} onClick={() => setTab('phone')}>
          По телефону
        </button>
        <button type="button" className={tabClass(tab === 'email')} onClick={() => setTab('email')}>
          Email и пароль
        </button>
      </div>

      {tab === 'phone' && !showCodeStep && (
        <form action={reqAction} className="space-y-4">
          <label className="block">
            <span className="text-sm text-steel">Номер телефона</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="+7 999 123-45-67"
              defaultValue={reqState.phone}
              className={`mt-1 w-full rounded-lg border px-3 py-2.5 outline-none focus:ring-2 focus:ring-volt ${
                phoneError ? 'border-red-500' : 'border-line'
              }`}
            />
          </label>
          {phoneError && <p className="text-sm text-red-600">{phoneError}</p>}
          <div onClick={() => setForcePhoneInput(false)}>
            <SubmitButton label="Получить код из SMS" pendingLabel="Отправляем…" />
          </div>
          <p className="text-xs text-steel">
            Если аккаунта ещё нет, он будет создан автоматически после входа.
          </p>
        </form>
      )}

      {tab === 'phone' && showCodeStep && (
        <div className="space-y-4">
          <p className="text-sm">
            Номер: <span className="font-semibold">{formatPhone(reqState.phone)}</span>{' '}
            <button
              type="button"
              onClick={() => setForcePhoneInput(true)}
              className="text-xs text-steel charge-link"
            >
              Изменить
            </button>
          </p>
          {reqState.notice && <p className="text-sm text-steel">{reqState.notice}</p>}

          <form action={verAction} className="space-y-4">
            <input type="hidden" name="phone" value={reqState.phone} />
            <label className="block">
              <span className="text-sm text-steel">Код из SMS</span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={CODE_LENGTH}
                placeholder={'•'.repeat(CODE_LENGTH)}
                className={`mt-1 w-full rounded-lg border px-3 py-2.5 tracking-[0.4em] text-center text-lg outline-none focus:ring-2 focus:ring-volt ${
                  verState.error ? 'border-red-500' : 'border-line'
                }`}
              />
            </label>
            {verState.phase === 'code' && verState.error && (
              <p className="text-sm text-red-600">{verState.error}</p>
            )}
            <SubmitButton label="Войти" pendingLabel="Проверяем…" />
          </form>

          <form action={reqAction}>
            <input type="hidden" name="phone" value={reqState.phone} />
            <button type="submit" className="text-xs text-steel charge-link">
              Отправить код ещё раз
            </button>
          </form>
        </div>
      )}

      {tab === 'email' && (
        <form action={emailAction} className="space-y-4">
          <label className="block">
            <span className="text-sm text-steel">Email</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              defaultValue={emailState.email}
              className={`mt-1 w-full rounded-lg border px-3 py-2.5 outline-none focus:ring-2 focus:ring-volt ${
                emailState.error ? 'border-red-500' : 'border-line'
              }`}
            />
          </label>
          <label className="block">
            <span className="text-sm text-steel">Пароль</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              className={`mt-1 w-full rounded-lg border px-3 py-2.5 outline-none focus:ring-2 focus:ring-volt ${
                emailState.error ? 'border-red-500' : 'border-line'
              }`}
            />
          </label>
          {emailState.error && <p className="text-sm text-red-600">{emailState.error}</p>}
          <SubmitButton label="Войти" pendingLabel="Проверяем…" />
          <p className="text-xs text-steel">
            Вход по паролю доступен, если вы задали его в профиле. Впервые у нас —
            войдите по телефону на соседней вкладке.
          </p>
        </form>
      )}
    </div>
  );
}