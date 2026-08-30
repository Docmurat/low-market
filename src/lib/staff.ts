/**
 * Доступ персонала к разделу модерации /moder.
 * Живёт отдельно от auth.ts, чтобы его не трогать: импортирует готовый
 * getSessionUser. Серверный модуль (next/headers через auth.ts) —
 * в клиентские компоненты НЕ импортировать.
 */
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { canModerate, type UserView } from '@/lib/auth-shared';

/**
 * Пускает admin и moderator. Не вошёл → на страницу входа;
 * вошёл без прав → молча на главную (как с админкой: посторонним
 * незачем знать, что раздел существует).
 * redirect() бросает исключение — НЕ звать внутри try/catch.
 */
export async function requireModerator(): Promise<UserView> {
  const user = await getSessionUser();
  if (!user) redirect('/account/login');
  if (!canModerate(user.role)) redirect('/');
  return user;
}
