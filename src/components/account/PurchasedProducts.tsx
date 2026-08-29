/**
 * Блок «Ваши покупки» в личном кабинете (Шаг 9, доработка): товары из оплаченных/
 * выполненных заказов пользователя (по userId ИЛИ телефону, без дублей). Отзыв
 * оставляется ПРЯМО ЗДЕСЬ — раскрывающаяся форма в PurchasedList (решение
 * владельца: без переходов из страницы в страницу). Этот серверный компонент
 * только собирает данные; интерактив — в клиентском PurchasedList.
 */
import { prisma } from '@/lib/db';
import PurchasedList, { type PurchasedItem } from '@/components/account/PurchasedList';

const PAID_STATUSES = ['paid', 'shipped', 'done'];
const MAX_SHOWN = 12;

export default async function PurchasedProducts({ userId, phone }: { userId: number; phone: string }) {
  // Последние позиции оплаченных заказов; дубли товаров убираем, свежие сверху.
  const items = await prisma.orderItem.findMany({
    where: { order: { status: { in: PAID_STATUSES }, OR: [{ userId }, { phone }] } },
    orderBy: { id: 'desc' },
    take: 100,
    select: {
      productId: true,
      product: { select: { id: true, slug: true, name: true, brand: true, images: true, isActive: true } },
    },
  });

  const seen = new Set<number>();
  const products: Omit<PurchasedItem, 'myRating'>[] = [];
  for (const it of items) {
    const p = it.product;
    if (!p || !p.isActive || seen.has(p.id)) continue; // удалённые/неактивные не зовём к отзыву
    seen.add(p.id);
    products.push({ id: p.id, slug: p.slug, name: p.name, brand: p.brand, image: p.images[0] ?? '' });
    if (products.length >= MAX_SHOWN) break;
  }
  if (products.length === 0) return null; // нечего показывать — блок не рисуем вовсе

  const reviews = await prisma.review.findMany({
    where: { userId, productId: { in: products.map((p) => p.id) } },
    select: { productId: true, rating: true },
  });
  const mine = new Map(reviews.map((r) => [r.productId, r]));

  const list: PurchasedItem[] = products.map((p) => ({
    ...p,
    myRating: mine.get(p.id)?.rating ?? null,
  }));

  // Заголовки групп («Последние покупки» / «Прошлые покупки») рисует сам список.
  return (
    <section className="mb-8">
      <PurchasedList items={list} />
    </section>
  );
}
