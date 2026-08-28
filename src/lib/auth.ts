/**
 * Авторизация: серверное ядро (только server components / server actions).
 * Импортирует next/headers — В КЛИЕНТСКИЕ КОМПОНЕНТЫ НЕ ИМПОРТИРОВАТЬ.
 * Общие константы/типы — в src/lib/auth-shared.ts.
 *
 * Пароли: crypto.scrypt (встроен в Node, сторонних библиотек не нужно).
 * Формат хранения: "scrypt:<соль hex>:<хеш hex>".
 */
import 'server-only';
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE, SESSION_DAYS, type UserView } from '@/lib/auth-shared';

export * from '@/lib/auth-shared';

// ---------- пароли ----------

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual); // сравнение за постоянное время — против timing-атак
}

// ---------- SMS-код ----------

/** Случайный 6-значный код (криптостойкий randomInt, не Math.random). */
export function generateLoginCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

// ---------- сессии ----------

export function readSessionId(): string | null {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

function toUserView(u: { id: number; phone: string; email: string | null; name: string; passwordHash: string | null }): UserView {
  return { id: u.id, phone: u.phone, email: u.email, name: u.name, hasPassword: u.passwordHash != null };
}

/**
 * Текущий пользователь или null. Безопасно звать из любых серверных компонентов.
 * Протухшие сессии игнорируются (подчищаем их лениво в createSession).
 */
export async function getSessionUser(): Promise<UserView | null> {
  const id = readSessionId();
  if (!id) return null;
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { select: { id: true, phone: true, email: true, name: true, passwordHash: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return toUserView(session.user);
}

/**
 * Создать сессию и положить её id в cookie.
 * ВАЖНО: cookies().set() работает только в server action / route handler —
 * звать эту функцию можно только оттуда (наши грабли из PROJECT_STATE).
 */
export async function createSession(userId: number): Promise<void> {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.session.create({ data: { userId, expiresAt } });
  // Лениво подчищаем протухшие сессии этого пользователя.
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  cookies().set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** Выход: удалить сессию из БД и cookie. Тоже только из server action. */
export async function destroySession(): Promise<void> {
  const id = readSessionId();
  if (id) {
    await prisma.session.delete({ where: { id } }).catch(() => {}); // уже удалена — не страшно
  }
  cookies().delete(SESSION_COOKIE);
}