'use server';
/**
 * Server actions профиля.
 *  updateProfile  — имя и email (email уникален; по нему потом вход с паролем).
 *  changePassword — установка/смена пароля. Требует email (иначе входить будет не по чему);
 *                   при смене — проверяет текущий пароль.
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import {
  getSessionUser,
  hashPassword,
  verifyPassword,
  isValidEmail,
  passwordProblem,
} from '@/lib/auth';

export type ProfileState = {
  name: string;
  email: string;
  error: string | null;
  success: string | null;
};

export type PasswordState = {
  error: string | null;
  success: string | null;
};

export async function updateProfile(_prev: ProfileState, fd: FormData): Promise<ProfileState> {
  const user = await getSessionUser();
  if (!user) redirect('/account/login');

  const name = String(fd.get('name') ?? '').trim().slice(0, 100);
  const email = String(fd.get('email') ?? '').trim().toLowerCase().slice(0, 100);

  if (email && !isValidEmail(email)) {
    return { name, email, error: 'Проверьте email', success: null };
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { name, email: email || null },
    });
  } catch (e) {
    // P2002 = нарушение уникальности (email уже занят другим аккаунтом)
    if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
      return { name, email, error: 'Этот email уже привязан к другому аккаунту', success: null };
    }
    throw e;
  }

  revalidatePath('/', 'layout'); // имя в шапке
  return { name, email, error: null, success: 'Сохранено' };
}

export async function changePassword(_prev: PasswordState, fd: FormData): Promise<PasswordState> {
  const user = await getSessionUser();
  if (!user) redirect('/account/login');

  const current = String(fd.get('currentPassword') ?? '');
  const next = String(fd.get('newPassword') ?? '');
  const confirm = String(fd.get('confirmPassword') ?? '');

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, passwordHash: true },
  });
  if (!dbUser) redirect('/account/login');

  if (!dbUser.email) {
    return { error: 'Сначала укажите email в профиле — вход с паролем выполняется по нему', success: null };
  }
  if (dbUser.passwordHash && !verifyPassword(current, dbUser.passwordHash)) {
    return { error: 'Текущий пароль не подошёл', success: null };
  }
  const problem = passwordProblem(next);
  if (problem) return { error: problem, success: null };
  if (next !== confirm) return { error: 'Пароли в двух полях не совпадают', success: null };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(next) },
  });

  return { error: null, success: 'Пароль сохранён — теперь можно входить по email и паролю' };
}
