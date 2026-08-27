'use server';
/**
 * Server actions корзины. Вызываются из клиентских компонентов
 * (AddToCartButton, CartItemRow). Все проверки — здесь, на сервере:
 * активность товара, остаток, Честный ЗНАК, лимит количества.
 */
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { CART_COOKIE, CART_COOKIE_MAX_AGE, checkPurchasable, clampQty } from '@/lib/cart';

export type CartActionResult = { ok: true; count: number } | { ok: false; error: string };

async function ensureCartId(): Promise<string> {
  const jar = cookies();
  const existing = jar.get(CART_COOKIE)?.value;
  if (existing) {
    const found = await prisma.cart.findUnique({ where: { id: existing }, select: { id: true } });
    if (found) return found.id;
  }
  const cart = await prisma.cart.create({ data: {} });
  jar.set(CART_COOKIE, cart.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: CART_COOKIE_MAX_AGE,
  });
  return cart.id;
}

async function countOf(cartId: string): Promise<number> {
  const agg = await prisma.cartItem.aggregate({ where: { cartId }, _sum: { qty: true } });
  return agg._sum.qty ?? 0;
}

function refresh() {
  // Обновляем шапку (счётчик) и страницу корзины на всех маршрутах.
  revalidatePath('/', 'layout');
}

export async function addToCart(productId: number, qty = 1): Promise<CartActionResult> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: Number(productId) },
      select: { id: true, isActive: true, stock: true, gism: true },
    });
    if (!product) return { ok: false, error: 'Товар не найден' };
    const problem = checkPurchasable(product);
    if (problem) return { ok: false, error: problem };

    const cartId = await ensureCartId();
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId: product.id } },
      select: { id: true, qty: true },
    });
    const wanted = clampQty((existing?.qty ?? 0) + qty, product.stock);

    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { qty: wanted } });
    } else {
      await prisma.cartItem.create({ data: { cartId, productId: product.id, qty: wanted } });
    }
    refresh();
    return { ok: true, count: await countOf(cartId) };
  } catch (e) {
    console.error('addToCart', e);
    return { ok: false, error: 'Не удалось добавить товар. Попробуйте ещё раз.' };
  }
}

export async function setItemQty(itemId: number, qty: number): Promise<CartActionResult> {
  try {
    const cartId = cookies().get(CART_COOKIE)?.value;
    if (!cartId) return { ok: false, error: 'Корзина не найдена' };
    const item = await prisma.cartItem.findFirst({
      where: { id: Number(itemId), cartId },
      include: { product: { select: { stock: true } } },
    });
    if (!item) return { ok: false, error: 'Позиция не найдена' };

    if (qty <= 0) {
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      await prisma.cartItem.update({ where: { id: item.id }, data: { qty: clampQty(qty, item.product.stock) } });
    }
    refresh();
    return { ok: true, count: await countOf(cartId) };
  } catch (e) {
    console.error('setItemQty', e);
    return { ok: false, error: 'Не удалось изменить количество' };
  }
}

export async function removeItem(itemId: number): Promise<CartActionResult> {
  return setItemQty(itemId, 0);
}

export async function clearCart(): Promise<CartActionResult> {
  try {
    const cartId = cookies().get(CART_COOKIE)?.value;
    if (!cartId) return { ok: true, count: 0 };
    await prisma.cartItem.deleteMany({ where: { cartId } });
    refresh();
    return { ok: true, count: 0 };
  } catch (e) {
    console.error('clearCart', e);
    return { ok: false, error: 'Не удалось очистить корзину' };
  }
}
