export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { formatPrice } from '@/lib/format';
import { DELIVERY_OPTIONS, ORDER_STATUS_LABEL, formatAddress, formatPhone } from '@/lib/checkout-shared';
import { getPayment, isPaymentEnabled } from '@/lib/payment/yookassa';
import PayOrderButton from '@/components/order/PayOrderButton';

export const metadata = { title: 'Ваш заказ' };

const ORDER_INCLUDE = { items: { orderBy: { id: 'asc' as const } } };

type OrderWithItems = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function loadOrder(token: string) {
  return prisma.order.findUnique({ where: { accessToken: token }, include: ORDER_INCLUDE });
}

/**
 * Шаг 7: сверка статуса платежа при открытии страницы. Покупатель возвращается
 * с платёжной формы ЮKassa именно сюда, а webhook до localhost не достучится —
 * поэтому страница сама спрашивает ЮKassa и при успехе переводит заказ в paid.
 * На проде это станет подстраховкой webhook-а. Ошибки сети глотаем: страница
 * заказа должна открываться всегда, даже если ЮKassa недоступна.
 */
async function syncPayment(order: OrderWithItems): Promise<OrderWithItems> {
  if (!order.paymentId || !isPaymentEnabled()) return order;
  if (order.paymentStatus === 'succeeded' || order.paymentStatus === 'canceled') return order;
  try {
    const p = await getPayment(order.paymentId);
    if (p.status === 'succeeded') {
      return await prisma.order.update({
        where: { id: order.id },
        data: {
          status: order.status === 'new' ? 'paid' : order.status,
          paymentStatus: 'succeeded',
          paidAt: order.paidAt ?? new Date(),
        },
        include: ORDER_INCLUDE,
      });
    }
    if (p.status === 'canceled') {
      return await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'canceled' },
        include: ORDER_INCLUDE,
      });
    }
  } catch (e) {
    console.error('[order] не удалось сверить статус платежа:', e);
  }
  return order;
}

export default async function OrderPage({ params, searchParams }: { params: { token: string }; searchParams: { [k: string]: string | undefined } }) {
  let order = await loadOrder(params.token);
  if (!order) notFound();
  order = await syncPayment(order);

  const payEnabled = isPaymentEnabled();
  const isNew = order.status === 'new';
  const awaitingPayment = isNew && payEnabled; // создан, но не оплачен
  const payCancelled = order.paymentStatus === 'canceled';
  const payError = searchParams.payerror === '1';

  const delivery = DELIVERY_OPTIONS.find((o) => o.value === order.deliveryMethod)?.label ?? order.deliveryMethod;
  const created = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(order.createdAt);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      {awaitingPayment && !searchParams.view && (
        <div className="mb-6 rounded-2xl bg-ink text-white p-8">
          <h1 className="font-display text-2xl font-bold">Заказ {order.number} создан — остался один шаг</h1>
          <p className="mt-2 text-gray-300">
            Оплатите заказ, и мы сразу возьмём его в работу: зарезервируем товар и оформим доставку.
          </p>
          {(payCancelled || payError) && (
            <p className="mt-3 rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">
              {payError
                ? 'Не получилось запустить оплату — попробуйте ещё раз через минуту.'
                : 'Оплата не прошла или была отменена. Деньги не списаны — попробуйте ещё раз.'}
            </p>
          )}
          <div className="mt-5">
            <PayOrderButton token={order.accessToken} />
          </div>
          <p className="mt-4 text-xs text-gray-400">
            Уже оплатили? Обновите эту страницу через минуту — статус подтянется.
            Сохраните ссылку на страницу: по ней видно состояние заказа.
          </p>
        </div>
      )}

      {isNew && !payEnabled && !searchParams.view && (
        <div className="mb-6 rounded-2xl bg-ink text-white p-8">
          <div className="text-3xl mb-2">✅</div>
          <h1 className="font-display text-2xl font-bold">Заказ {order.number} принят</h1>
          <p className="mt-2 text-gray-300">
            Спасибо! Менеджер свяжется с вами по телефону {formatPhone(order.phone)} в рабочее время
            и пришлёт ссылку на оплату.
          </p>
          <p className="mt-3 text-xs text-gray-400">Сохраните ссылку на эту страницу — по ней видно состояние заказа.</p>
        </div>
      )}

      {order.status === 'paid' && !searchParams.view && (
        <div className="mb-6 rounded-2xl bg-ink text-white p-8">
          <div className="text-3xl mb-2">✅</div>
          <h1 className="font-display text-2xl font-bold">Заказ {order.number} оплачен</h1>
          <p className="mt-2 text-gray-300">
            Спасибо! Заказ передан в обработку: мы резервируем товар и оформляем доставку.
            Чек придёт {order.email ? `на ${order.email}` : 'по SMS'}. Если что-то потребуется
            уточнить, менеджер позвонит по телефону {formatPhone(order.phone)}.
          </p>
          <p className="mt-3 text-xs text-gray-400">Сохраните ссылку на эту страницу — по ней видно состояние заказа.</p>
        </div>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
        <h2 className="font-display text-xl font-bold">Заказ {order.number}</h2>
        <span className="text-sm text-steel">{created}</span>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="inline-block rounded-full bg-volt/20 px-3 py-1 text-sm font-medium">
          {ORDER_STATUS_LABEL[order.status] ?? order.status}
        </span>
        {awaitingPayment && searchParams.view && <PayOrderButton token={order.accessToken} />}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl bg-card border border-line p-6">
          <h3 className="font-semibold mb-3">Получатель</h3>
          <dl className="grid gap-1.5 text-sm grid-cols-[110px_1fr]">
            <dt className="text-steel">Имя</dt><dd>{order.customerName}</dd>
            <dt className="text-steel">Телефон</dt><dd>{formatPhone(order.phone)}</dd>
            {order.email && (<><dt className="text-steel">Email</dt><dd>{order.email}</dd></>)}
          </dl>
        </section>
        <section className="rounded-2xl bg-card border border-line p-6">
          <h3 className="font-semibold mb-3">Доставка</h3>
          <dl className="grid gap-1.5 text-sm grid-cols-[110px_1fr]">
            <dt className="text-steel">Способ</dt><dd>{delivery}</dd>
            {order.deliveryMethod === 'courier' && (<><dt className="text-steel">Адрес</dt><dd>{formatAddress(order)}</dd></>)}
            {order.comment && (<><dt className="text-steel">Комментарий</dt><dd className="whitespace-pre-line">{order.comment}</dd></>)}
          </dl>
        </section>
      </div>

      <section className="mt-6 rounded-2xl bg-card border border-line px-6">
        <h3 className="font-semibold py-4">Состав заказа</h3>
        <ul className="divide-y divide-line">
          {order.items.map((it) => (
            <li key={it.id} className="flex gap-4 py-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-steel">{it.sku}</div>
                <div>{it.brand} {it.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold tabular-nums">{formatPrice(Number(it.price) * it.qty)}</div>
                <div className="text-xs text-steel tabular-nums">{formatPrice(it.price)} × {it.qty}</div>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-line py-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-steel">Товары</span>
            <span className="tabular-nums">{formatPrice(order.itemsTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-steel">Доставка</span>
            <span className="tabular-nums">
              {Number(order.deliveryCost) > 0
                ? formatPrice(order.deliveryCost)
                : 'бесплатно'}
            </span>
          </div>
          <div className="flex justify-between items-end pt-2">
            <span className="font-semibold">Итого</span>
            <span className="text-2xl font-bold tabular-nums">{formatPrice(order.total)}</span>
          </div>
        </div>
      </section>

      <div className="mt-8">
        <Link href="/" className="inline-block rounded-lg border border-line px-5 py-2.5 text-sm font-medium hover:border-volt transition-colors">
          ← Вернуться в магазин
        </Link>
      </div>
    </div>
  );
}
