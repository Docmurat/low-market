/**
 * Webhook ЮKassa (шаг 7): POST /api/yookassa/webhook.
 * ЮKassa присылает сюда уведомления о событиях платежа (payment.succeeded и др.).
 *
 * ЛОКАЛЬНО НЕ РАБОТАЕТ и не тестируется: ЮKassa не может достучаться до localhost.
 * Включим на шаге 12: в кабинете ЮKassa (Интеграция → HTTP-уведомления) укажем
 * https://<домен>/api/yookassa/webhook и события payment.succeeded, payment.canceled.
 * До тех пор статус оплаты подтягивает страница заказа (syncPayment) — она же
 * остаётся подстраховкой webhook-а на проде.
 *
 * Безопасность: телу запроса НЕ доверяем (его может прислать кто угодно) — берём из
 * него только id платежа и сами спрашиваем ЮKassa настоящий статус по API.
 */
import { prisma } from '@/lib/db';
import { getPayment, isPaymentEnabled } from '@/lib/payment/yookassa';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  const paymentId = (body as { object?: { id?: unknown } })?.object?.id;
  if (typeof paymentId !== 'string' || paymentId.length === 0 || !isPaymentEnabled()) {
    // Нечего обрабатывать — отвечаем 200, чтобы ЮKassa не долбила повторами.
    return new Response('ok', { status: 200 });
  }

  try {
    const payment = await getPayment(paymentId); // настоящий статус — только из API
    const order = await prisma.order.findFirst({ where: { paymentId: payment.id } });
    if (order) {
      if (payment.status === 'succeeded' && order.paymentStatus !== 'succeeded') {
        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: order.status === 'new' ? 'paid' : order.status,
            paymentStatus: 'succeeded',
            paidAt: order.paidAt ?? new Date(),
          },
        });
      } else if (payment.status === 'canceled' && order.paymentStatus !== 'succeeded') {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'canceled' },
        });
      }
    }
  } catch (e) {
    console.error('[yookassa webhook] ошибка обработки:', e);
    // 500 → ЮKassa повторит уведомление позже, ничего не потеряем.
    return new Response('error', { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
