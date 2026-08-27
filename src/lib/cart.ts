/**
 * Корзина: чтение (только server components / server actions).
 * Константы и типы — в src/lib/cart-shared.ts (можно импортировать в клиенте).
 * Изменения — в src/app/cart/actions.ts.
 */
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { CART_COOKIE, cartTotals, type CartItemView, type CartView } from '@/lib/cart-shared';

export * from '@/lib/cart-shared';

export const cartItemProductSelect = {
  id: true,
  slug: true,
  name: true,
  brand: true,
  price: true,
  stock: true,
  stockLabel: true,
  images: true,
  supplierSku: true,
  isActive: true,
  gism: true,
} as const;

export function readCartId(): string | null {
  return cookies().get(CART_COOKIE)?.value ?? null;
}

/** Корзина текущего посетителя или null. */
export async function getCart(): Promise<CartView | null> {
  const id = readCartId();
  if (!id) return null;
  const cart = await prisma.cart.findUnique({
    where: { id },
    include: {
      items: { include: { product: { select: cartItemProductSelect } }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!cart) return null;

  const items: CartItemView[] = cart.items.map((i) => ({
    id: i.id,
    qty: i.qty,
    product: {
      id: i.product.id,
      slug: i.product.slug,
      name: i.product.name,
      brand: i.product.brand,
      price: Number(i.product.price),
      stock: i.product.stock,
      stockLabel: i.product.stockLabel,
      image: i.product.images[0] ?? null,
      sku: i.product.supplierSku,
      isActive: i.product.isActive,
      gism: i.product.gism,
    },
  }));
  return { id: cart.id, items, ...cartTotals(items) };
}

/** Счётчик для шапки: одна лёгкая агрегация. */
export async function getCartCount(): Promise<number> {
  const id = readCartId();
  if (!id) return 0;
  const agg = await prisma.cartItem.aggregate({ where: { cartId: id }, _sum: { qty: true } });
  return agg._sum.qty ?? 0;
}