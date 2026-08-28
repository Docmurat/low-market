'use client';
/**
 * Профиль: две независимые формы — «Имя и email» и «Пароль».
 * Проверки — на сервере (src/app/account/profile/actions.ts).
 */
import { useFormState, useFormStatus } from 'react-dom';
import {
  updateProfile,
  changePassword,
  type ProfileState,
  type PasswordState,
} from '@/app/account/profile/actions';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-shared';

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

function Messages({ error, success }: { error: string | null; success: string | null }) {
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (success) return <p className="text-sm text-green-700">{success}</p>;
  return null;
}

const inputClass = (invalid: boolean) =>
  `mt-1 w-full rounded-lg border px-3 py-2.5 outline-none focus:ring-2 focus:ring-volt ${
    invalid ? 'border-red-500' : 'border-line'
  }`;

export default function ProfileForm({
  initialName,
  initialEmail,
  hasPassword,
}: {
  initialName: string;
  initialEmail: string;
  hasPassword: boolean;
}) {
  const profileInitial: ProfileState = {
    name: initialName,
    email: initialEmail,
    error: null,
    success: null,
  };
  const passwordInitial: PasswordState = { error: null, success: null };

  const [pState, pAction] = useFormState<ProfileState, FormData>(updateProfile, profileInitial);
  const [wState, wAction] = useFormState<PasswordState, FormData>(changePassword, passwordInitial);

  return (
    <div className="space-y-6">
      <form action={pAction} className="rounded-2xl bg-card border border-line p-6 space-y-4">
        <h2 className="font-semibold">Имя и email</h2>
        <label className="block">
          <span className="text-sm text-steel">Имя</span>
          <input
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={pState.name}
            className={inputClass(false)}
          />
        </label>
        <label className="block">
          <span className="text-sm text-steel">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={pState.email}
            placeholder="для входа с паролем и чеков"
            className={inputClass(Boolean(pState.error))}
          />
        </label>
        <Messages error={pState.error} success={pState.success} />
        <SubmitButton label="Сохранить" pendingLabel="Сохраняем…" />
      </form>

      <form action={wAction} className="rounded-2xl bg-card border border-line p-6 space-y-4">
        <h2 className="font-semibold">{hasPassword ? 'Смена пароля' : 'Установить пароль'}</h2>
        {!hasPassword && (
          <p className="text-xs text-steel">
            Задайте пароль, чтобы входить по email без SMS. Сначала укажите email выше.
          </p>
        )}
        {hasPassword && (
          <label className="block">
            <span className="text-sm text-steel">Текущий пароль</span>
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              className={inputClass(false)}
            />
          </label>
        )}
        <label className="block">
          <span className="text-sm text-steel">Новый пароль (не короче {PASSWORD_MIN_LENGTH} символов)</span>
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            className={inputClass(Boolean(wState.error))}
          />
        </label>
        <label className="block">
          <span className="text-sm text-steel">Ещё раз новый пароль</span>
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            className={inputClass(Boolean(wState.error))}
          />
        </label>
        <Messages error={wState.error} success={wState.success} />
        <SubmitButton
          label={hasPassword ? 'Сменить пароль' : 'Установить пароль'}
          pendingLabel="Сохраняем…"
        />
      </form>
    </div>
  );
}
