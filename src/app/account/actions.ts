'use server';
/**
 * Server actions личного кабинета. Пока только выход; профиль — веха 4.3.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { destroySession } from '@/lib/auth';
import { CART_COOKIE } from '@/lib/cart-shared';

export async function logout(): Promise<void> {
  await destroySession();
  // Отвязываем cookie корзины: после выхода на общем компьютере
  // следующий человек не должен видеть корзину предыдущего.
  cookies().delete(CART_COOKIE);
  revalidatePath('/', 'layout');
  redirect('/');
}
