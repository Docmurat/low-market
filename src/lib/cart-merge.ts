/**
 * Слияние гостевой корзины с корзиной пользователя при входе.
 * Звать ТОЛЬКО из server actions (внутри ставится cookie).
 *
 * Логика:
 *  - у пользователя нет своей корзины → гостевая просто привязывается (userId);
 *  - у пользователя есть корзина → позиции гостевой доливаются в неё
 *    (qty суммируются, но не больше остатка и MAX_QTY), гостевая удаляется,
 *    cookie lm_cart переключается на корзину пользователя;
 *  - в cookie оказалась ЧУЖАЯ корзина (вход под другим аккаунтом на том же
 *    браузере) — её не трогаем, просто переключаемся на корзину пользователя.
 */
import 'server-only';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { CART_COOKIE, MAX_QTY } from '@/lib/cart-shared';

const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 дней — как в корзине

function setCartCookie(cartId: string): void {
  cookies().set(CART_COOKIE, cartId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: CART_COOKIE_MAX_AGE,
  });
}

/** Суммарное qty с потолками: остаток (если он известен и > 0) и MAX_QTY. */
function mergedQty(sum: number, stock: number): number {
  const cap = Math.min(MAX_QTY, stock > 0 ? stock : MAX_QTY);
  return Math.max(1, Math.min(sum, cap));
}

export async function mergeGuestCartIntoUser(userId: number): Promise<void> {
  const jar = cookies();
  const cookieCartId = jar.get(CART_COOKIE)?.value ?? null;

  const userCart = await prisma.cart.findFirst({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
  });

  // В cookie ничего нет → просто вернём пользователю его корзину, если она есть.
  if (!cookieCartId) {
    if (userCart) setCartCookie(userCart.id);
    return;
  }

  const cookieCart = await prisma.cart.findUnique({
    where: { id: cookieCartId },
    include: { items: { include: { product: { select: { stock: true } } } } },
  });

  // Cookie указывает на несуществующую корзину.
  if (!cookieCart) {
    if (userCart) setCartCookie(userCart.id);
    else jar.delete(CART_COOKIE);
    return;
  }

  // Это уже корзина этого пользователя — делать нечего.
  if (cookieCart.userId === userId) return;

  // Чужая корзина (другой аккаунт на этом браузере) — не сливаем и не портим.
  if (cookieCart.userId != null) {
    if (userCart) setCartCookie(userCart.id);
    else jar.delete(CART_COOKIE);
    return;
  }

  // Гостевая корзина. У пользователя своей нет → привязываем гостевую.
  if (!userCart) {
    await prisma.cart.update({ where: { id: cookieCart.id }, data: { userId } });
    return; // cookie уже указывает на неё
  }

  // Обе есть → доливаем позиции гостевой в корзину пользователя.
  for (const item of cookieCart.items) {
    const existing = await prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId: userCart.id, productId: item.productId } },
    });
    const qty = mergedQty((existing?.qty ?? 0) + item.qty, item.product.stock);
    await prisma.cartItem.upsert({
      where: { cartId_productId: { cartId: userCart.id, productId: item.productId } },
      create: { cartId: userCart.id, productId: item.productId, qty },
      update: { qty },
    });
  }
  await prisma.cart.delete({ where: { id: cookieCart.id } }); // позиции уйдут каскадом
  await prisma.cart.update({ where: { id: userCart.id }, data: { updatedAt: new Date() } });
  setCartCookie(userCart.id);
}
