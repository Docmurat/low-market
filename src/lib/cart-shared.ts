/**
 * Общие константы и типы корзины — БЕЗ серверных импортов,
 * чтобы их можно было использовать и в клиентских компонентах.
 */
export const CART_COOKIE = 'lm_cart';
export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 дней
export const MAX_QTY = 99;

export type CartItemView = {
  id: number;
  qty: number;
  product: {
    id: number;
    slug: string;
    name: string;
    brand: string;
    price: number;
    stock: number;
    stockLabel: string | null;
    image: string | null;
    sku: string;
    isActive: boolean;
    gism: boolean;
  };
};

export type CartView = {
  id: string;
  items: CartItemView[];
  count: number;    // штук всего
  subtotal: number; // сумма, ₽
};

/** Можно ли положить товар в корзину. Возвращает текст ошибки или null. */
export function checkPurchasable(p: { isActive: boolean; stock: number; gism: boolean }): string | null {
  if (!p.isActive) return 'Товар снят с продажи';
  if (p.gism) return 'Товар с обязательной маркировкой «Честный ЗНАК» — продажа откроется позже';
  if (p.stock <= 0) return 'Товара нет в наличии';
  return null;
}

export function clampQty(qty: number, stock: number): number {
  const n = Math.floor(Number(qty) || 1);
  return Math.max(1, Math.min(n, MAX_QTY, stock > 0 ? stock : 1));
}

export function cartTotals(items: CartItemView[]): { count: number; subtotal: number } {
  let count = 0;
  let subtotal = 0;
  for (const i of items) {
    count += i.qty;
    subtotal += i.qty * i.product.price;
  }
  return { count, subtotal: Math.round(subtotal * 100) / 100 };
}