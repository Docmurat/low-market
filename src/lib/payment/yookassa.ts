/**
 * Клиент API ЮKassa (шаг 7). Только сервер — в клиентские компоненты не импортировать.
 *
 * Ключи берутся из .env: YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY.
 * Пустые значения = оплата ВЫКЛЮЧЕНА (isPaymentEnabled() = false): чекаут работает
 * по-старому, кнопок оплаты нет — тот же принцип локального режима, что у SMS и Telegram.
 * Сейчас в .env тестовые ключи (test_...): платёжная форма настоящая, деньги не ходят,
 * оплата проходит только тестовой картой ЮKassa. Боевые ключи подставим на шаге 12.
 *
 * Платёж одностадийный (capture: true): деньги списываются сразу, без ручного
 * подтверждения. Чек 54-ФЗ отправляется вместе с платежом (receipt).
 */

// НДС в чеке: 6 = «без НДС» (мы на УСН до порога). Когда возьмёмся за задачу «Ц»
// и НДС, поменять этот код (и только его): 1 = НДС 20%, 2 = НДС 10% и т.д. по доке ЮKassa.
export const RECEIPT_VAT_CODE = 6;

const API_BASE = 'https://api.yookassa.ru/v3';
const TIMEOUT_MS = 20_000;

export type YooPaymentStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';

export type YooPayment = {
  id: string;
  status: YooPaymentStatus;
  paid: boolean;
  confirmation?: { type: string; confirmation_url?: string };
  cancellation_details?: { party?: string; reason?: string };
};

/** Позиция для платежа и чека. Цены в рублях (number), НЕ Decimal.
 *  subject: 'commodity' (товар, по умолчанию) | 'service' (услуга — например, доставка). */
export type PaymentItem = { name: string; priceRub: number; qty: number; subject?: 'commodity' | 'service' };

function config() {
  return {
    shopId: (process.env.YOOKASSA_SHOP_ID ?? '').trim(),
    secretKey: (process.env.YOOKASSA_SECRET_KEY ?? '').trim(),
  };
}

export function isPaymentEnabled(): boolean {
  const { shopId, secretKey } = config();
  return shopId.length > 0 && secretKey.length > 0;
}

/** Базовый адрес сайта для return_url. На проде задать SITE_URL в .env. */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

async function yooRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const { shopId, secretKey } = config();
  if (!shopId || !secretKey) throw new Error('ЮKassa не настроена (YOOKASSA_* в .env пусты)');

  const headers: Record<string, string> = {
    // Basic-авторизация: shopId:secretKey в base64 — так ЮKassa узнаёт магазин.
    Authorization: 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
    'Content-Type': 'application/json',
  };
  if (method === 'POST') {
    // Ключ идемпотентности: если запрос повторится (сеть моргнула), ЮKassa не создаст
    // второй платёж, а вернёт первый. Новый ключ = новый платёж.
    headers['Idempotence-Key'] = crypto.randomUUID();
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });

  const data = (await res.json().catch(() => null)) as
    | (T & { type?: string; code?: string; description?: string })
    | null;

  if (!res.ok || !data) {
    const why = data?.description || data?.code || `HTTP ${res.status}`;
    throw new Error(`ЮKassa: ${why}`);
  }
  return data;
}

/**
 * Создать платёж по заказу. Возвращает платёж с confirmation_url —
 * адресом платёжной формы, куда нужно отправить покупателя.
 */
export async function createOrderPayment(args: {
  orderNumber: string;
  totalRub: number;
  returnUrl: string; // куда ЮKassa вернёт покупателя после оплаты
  customerPhone: string; // нормализованный +7XXXXXXXXXX
  customerEmail?: string;
  items: PaymentItem[];
}): Promise<YooPayment> {
  const rub = (n: number) => n.toFixed(2);

  return yooRequest<YooPayment>('POST', '/payments', {
    amount: { value: rub(args.totalRub), currency: 'RUB' },
    capture: true, // одностадийный платёж: списание сразу, без ручного подтверждения
    confirmation: { type: 'redirect', return_url: args.returnUrl },
    description: `Заказ ${args.orderNumber} на LOW-Market`,
    metadata: { orderNumber: args.orderNumber },
    receipt: {
      // Чек 54-ФЗ. Телефон в чеке — без «+» (формат ЮKassa), email приоритетнее, если есть.
      customer: args.customerEmail
        ? { email: args.customerEmail }
        : { phone: args.customerPhone.replace(/\D/g, '') },
      items: args.items.map((it) => ({
        description: it.name.slice(0, 128), // ЮKassa ограничивает название позиции
        quantity: String(it.qty),
        amount: { value: rub(it.priceRub), currency: 'RUB' },
        vat_code: RECEIPT_VAT_CODE,
        payment_subject: it.subject ?? 'commodity', // предмет расчёта: товар или услуга (доставка)
        payment_mode: 'full_payment', // признак расчёта: полная оплата
      })),
    },
  });
}

/** Запросить актуальный статус платежа (используется страницей заказа и webhook-ом). */
export async function getPayment(paymentId: string): Promise<YooPayment> {
  return yooRequest<YooPayment>('GET', `/payments/${paymentId}`);
}
