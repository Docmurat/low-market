'use server';
/**
 * Server action страницы заказа покупателя (шаг 7): повторная попытка оплаты.
 * Доступ — по секретному accessToken из ссылки (та же модель, что у самой страницы),
 * поэтому авторизация не требуется. Каждое нажатие создаёт НОВЫЙ платёж в ЮKassa
 * (старый незавершённый просто останется брошенным — это нормально, ЮKassa сама
 * отменяет неоплаченные платежи по таймауту).
 */
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { createOrderPayment, isPaymentEnabled, siteUrl } from '@/lib/payment/yookassa';

export async function payForOrder(fd: FormData): Promise<void> {
  const token = String(fd.get('token') ?? '');
  if (!token) redirect('/');

  const order = await prisma.order.findUnique({
    where: { accessToken: token },
    include: { items: { orderBy: { id: 'asc' } } },
  });
  if (!order) redirect('/');

  // Платить можно только неоплаченный «живой» заказ.
  if (order.status !== 'new' || order.paymentStatus === 'succeeded' || !isPaymentEnabled()) {
    redirect(`/order/${token}`);
  }

  let payUrl: string | null = null;
  try {
    const payment = await createOrderPayment({
      orderNumber: order.number,
      totalRub: Number(order.total),
      returnUrl: `${siteUrl()}/order/${token}`,
      customerPhone: order.phone,
      customerEmail: order.email || undefined,
      items: order.items.map((it) => ({
        name: [it.brand, it.name].filter(Boolean).join(' '),
        priceRub: Number(it.price),
        qty: it.qty,
      })),
    });
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentId: payment.id, paymentStatus: payment.status },
    });
    payUrl = payment.confirmation?.confirmation_url ?? null;
  } catch (e) {
    console.error('[order] не удалось создать платёж ЮKassa:', e);
  }

  redirect(payUrl ?? `/order/${token}?payerror=1`);
}
