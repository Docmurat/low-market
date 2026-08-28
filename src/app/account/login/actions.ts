'use server';
/**
 * Server actions входа.
 *  requestCode       — шаг 1 входа по телефону: создаёт LoginCode и отправляет SMS
 *                      (в локальном режиме код печатается в терминале dev-сервера).
 *  verifyCode        — шаг 2: проверяет код, создаёт User при первом входе,
 *                      сливает гостевую корзину, открывает сессию.
 *  loginWithPassword — вход по email + паролю (пароль задаётся в профиле, веха 4.3).
 *
 * ВАЖНО: из файла с 'use server' можно экспортировать только async-функции и типы.
 * Начальные состояния форм живут в клиентском компоненте LoginForm.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import {
  createSession,
  generateLoginCode,
  verifyPassword,
  isValidEmail,
  isValidCodeFormat,
  CODE_TTL_MIN,
  CODE_MAX_ATTEMPTS,
  CODE_RESEND_SEC,
} from '@/lib/auth';
import { normalizePhone, formatPhone } from '@/lib/checkout-shared';
import { sendLoginCode, isLocalSmsMode } from '@/lib/sms';
import { mergeGuestCartIntoUser } from '@/lib/cart-merge';

export type PhoneLoginState = {
  phase: 'phone' | 'code';
  phone: string; // нормализованный +7XXXXXXXXXX (для скрытого поля формы кода)
  error: string | null;
  notice: string | null;
};

export type EmailLoginState = {
  email: string;
  error: string | null;
};

/** Общий финал успешного входа: корзина, сессия, обновление шапки, редирект в ЛК. */
async function finishLogin(userId: number): Promise<never> {
  await mergeGuestCartIntoUser(userId);
  await createSession(userId);
  revalidatePath('/', 'layout');
  redirect('/account');
}

export async function requestCode(_prev: PhoneLoginState, fd: FormData): Promise<PhoneLoginState> {
  const phone = normalizePhone(String(fd.get('phone') ?? ''));
  if (!phone) {
    return { phase: 'phone', phone: '', error: 'Укажите телефон в формате +7 999 123-45-67', notice: null };
  }

  const now = new Date();
  const last = await prisma.loginCode.findFirst({
    where: { phone },
    orderBy: { createdAt: 'desc' },
  });

  // Не чаще раза в CODE_RESEND_SEC. Если действующий код уже есть — просто ведём к вводу.
  if (last && now.getTime() - last.createdAt.getTime() < CODE_RESEND_SEC * 1000) {
    const stillValid = !last.usedAt && last.expiresAt > now && last.attempts < CODE_MAX_ATTEMPTS;
    if (stillValid) {
      return {
        phase: 'code',
        phone,
        error: null,
        notice: `Код уже отправлен на ${formatPhone(phone)}. Новый можно запросить через минуту.`,
      };
    }
    return { phase: 'phone', phone: '', error: 'Слишком часто. Подождите минуту и попробуйте снова.', notice: null };
  }

  const code = generateLoginCode();
  await prisma.loginCode.create({
    data: { phone, code, expiresAt: new Date(now.getTime() + CODE_TTL_MIN * 60 * 1000) },
  });

  try {
    await sendLoginCode(phone, code);
  } catch (e) {
    console.error('[login] ошибка отправки SMS:', e);
    return { phase: 'phone', phone: '', error: 'Не удалось отправить SMS. Попробуйте позже.', notice: null };
  }

  const where = isLocalSmsMode()
    ? ' (локальный режим: код напечатан в терминале dev-сервера)'
    : '';
  return {
    phase: 'code',
    phone,
    error: null,
    notice: `Код отправлен на ${formatPhone(phone)}${where}. Действует ${CODE_TTL_MIN} минут.`,
  };
}

export async function verifyCode(_prev: PhoneLoginState, fd: FormData): Promise<PhoneLoginState> {
  const phone = normalizePhone(String(fd.get('phone') ?? ''));
  const code = String(fd.get('code') ?? '').trim();

  if (!phone) {
    return { phase: 'phone', phone: '', error: 'Сессия ввода кода потерялась — запросите код заново.', notice: null };
  }
  const back: PhoneLoginState = { phase: 'code', phone, error: null, notice: null };
  if (!isValidCodeFormat(code)) return { ...back, error: 'Код — это 6 цифр из SMS' };

  const rec = await prisma.loginCode.findFirst({
    where: { phone, usedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  const now = new Date();
  if (!rec || rec.expiresAt < now) {
    return { ...back, error: 'Код устарел. Запросите новый.' };
  }
  if (rec.attempts >= CODE_MAX_ATTEMPTS) {
    return { ...back, error: 'Слишком много попыток. Запросите новый код.' };
  }
  if (rec.code !== code) {
    const upd = await prisma.loginCode.update({
      where: { id: rec.id },
      data: { attempts: { increment: 1 } },
    });
    const left = Math.max(0, CODE_MAX_ATTEMPTS - upd.attempts);
    return {
      ...back,
      error: left > 0 ? `Неверный код. Осталось попыток: ${left}.` : 'Слишком много попыток. Запросите новый код.',
    };
  }

  await prisma.loginCode.update({ where: { id: rec.id }, data: { usedAt: now } });

  // Первый вход = регистрация: аккаунт создаётся по телефону автоматически.
  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone },
    update: {},
    select: { id: true },
  });

  await finishLogin(user.id);
  return back; // недостижимо (finishLogin делает redirect) — для TypeScript
}

export async function loginWithPassword(_prev: EmailLoginState, fd: FormData): Promise<EmailLoginState> {
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const password = String(fd.get('password') ?? '');

  if (!isValidEmail(email)) return { email, error: 'Проверьте email' };
  if (!password) return { email, error: 'Введите пароль' };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  });
  // Один и тот же ответ на «нет такого email» и «пароль не подошёл» —
  // чтобы по форме нельзя было перебирать, какие email зарегистрированы.
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    return { email, error: 'Неверный email или пароль' };
  }

  await finishLogin(user.id);
  return { email, error: null }; // недостижимо — для TypeScript
}
