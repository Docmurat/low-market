/**
 * Авторизация: константы, типы и проверки БЕЗ серверных импортов.
 * Можно импортировать и в клиентских ('use client'), и в серверных компонентах.
 * Серверная логика (сессии, хеши паролей) — в src/lib/auth.ts.
 */

/** Cookie сессии (httpOnly, ставится только в server actions). */
export const SESSION_COOKIE = 'lm_session';
/** Срок жизни сессии, дней. */
export const SESSION_DAYS = 30;

/** SMS-код: длина, срок жизни, лимиты. */
export const CODE_LENGTH = 6;
export const CODE_TTL_MIN = 5; // код действует 5 минут
export const CODE_MAX_ATTEMPTS = 5; // попыток ввода на один код
export const CODE_RESEND_SEC = 60; // повторная отправка не чаще раза в минуту

export const PASSWORD_MIN_LENGTH = 8;

/** Роли: customer (по умолчанию) | admin (назначается scripts/make-admin.ts). */
export type UserRole = 'customer' | 'admin';

/** Проверка email. Не идеальная (идеальной не существует), но отсекает явный мусор. */
export function isValidEmail(email: string): boolean {
  const e = email.trim();
  if (e.length < 5 || e.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

/** Проверка пароля. Возвращает текст ошибки или null, если всё хорошо. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Пароль слишком короткий — нужно не меньше ${PASSWORD_MIN_LENGTH} символов`;
  }
  if (password.length > 128) return 'Пароль слишком длинный (максимум 128 символов)';
  return null;
}

/** Код — ровно CODE_LENGTH цифр? */
export function isValidCodeFormat(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim());
}

/** Данные пользователя, безопасные для передачи в клиентские компоненты. */
export type UserView = {
  id: number;
  phone: string;
  email: string | null;
  name: string;
  hasPassword: boolean;
  role: UserRole;
};
