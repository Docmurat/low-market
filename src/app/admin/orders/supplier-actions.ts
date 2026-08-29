'use server';
/**
 * Server actions блока «Заказ у поставщика» в карточке заказа админки (шаг 6c).
 *
 * Решение шага 6c: заказы АБСОЛЮТ ТРЕЙД оформляем ВРУЧНУЮ в их кабинете,
 * API-заказы (Shipment/CreateOrder) НЕ используем. Здесь только чтение и пометки:
 *
 *  checkSupplierAvailability — живой запрос остатков и закупочных цен по позициям
 *      заказа (GET AvailabilityAndPrice, один запрос на все артикулы). Ничего не
 *      заказывает и не меняет — только смотрит. С ПК запрос идёт через прокси
 *      сервера: dev-сервер должен быть запущен с NODE_EXTRA_CA_CERTS (сертификат
 *      прокси) и при ВЫКЛЮЧЕННОМ VPN — иначе будет сетевая ошибка.
 *  saveSupplierOrderNumber   — сохранить номер ручного заказа из кабинета
 *      поставщика (+ отметка времени при первом сохранении).
 *
 * ВАЖНО: из файла с 'use server' можно экспортировать только async-функции и типы.
 * Начальное состояние формы проверки живёт в клиенте (SupplierOrderPanel).
 */
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { AbsolutClient, parseStock } from '@/lib/supplier/absolut';
import { purchasePriceWithVat } from '@/lib/pricing';

/** Строка результата проверки — по одной на позицию заказа. */
export type SupplierCheckRow = {
  sku: string; // артикул поставщика (productId)
  found: boolean; // нашёлся ли товар в ответе API
  stockQty: number; // остаток числом ("> 10" → 10)
  stockLabel: string | null; // метка остатка как у поставщика ("> 10"), если была
  newBase: number | null; // закупка сейчас (с НДС, как считает pricing.ts)
  baseDiff: number | null; // newBase − закупка на момент заказа (>0 = подорожал)
};

export type SupplierCheckState = {
  status: 'idle' | 'ok' | 'error';
  checkedAt: string | null; // "14:59" — время проверки для подписи
  rows: SupplierCheckRow[];
  message: string | null; // текст ошибки, если status = error
};

export async function checkSupplierAvailability(
  _prev: SupplierCheckState,
  fd: FormData,
): Promise<SupplierCheckState> {
  await requireAdmin(); // защита и на уровне action, не только страницы

  const orderId = Number(fd.get('orderId'));
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return { status: 'error', checkedAt: null, rows: [], message: 'Некорректный заказ.' };
  }

  const items = await prisma.orderItem.findMany({
    where: { orderId },
    orderBy: { id: 'asc' },
    select: { sku: true, basePrice: true },
  });
  if (items.length === 0) {
    return { status: 'error', checkedAt: null, rows: [], message: 'В заказе нет позиций.' };
  }

  const productIds = items
    .map((it) => Number(it.sku))
    .filter((n) => Number.isFinite(n) && n > 0);

  try {
    const api = new AbsolutClient();
    const answer = await api.availabilityAndPrice({ productIds });
    const bySku = new Map((answer ?? []).map((r) => [String(r.productId), r]));

    const rows: SupplierCheckRow[] = items.map((it) => {
      const r = bySku.get(it.sku);
      if (!r) {
        return { sku: it.sku, found: false, stockQty: 0, stockLabel: null, newBase: null, baseDiff: null };
      }
      // Поставщик в этом методе может назвать поле stockQuantity или inStock — берём что есть.
      const { quantity, label } = parseStock(r.stockQuantity ?? r.inStock);
      const newBase = purchasePriceWithVat(Number(r.price) || 0);
      return {
        sku: it.sku,
        found: true,
        stockQty: quantity,
        stockLabel: label,
        newBase,
        baseDiff: Math.round((newBase - Number(it.basePrice)) * 100) / 100,
      };
    });

    const checkedAt = new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());

    return { status: 'ok', checkedAt, rows, message: null };
  } catch (e) {
    return {
      status: 'error',
      checkedAt: null,
      rows: [],
      message:
        'Не удалось опросить поставщика: ' +
        (e as Error).message.slice(0, 200) +
        '. Проверьте: VPN выключен, dev-сервер запущен с NODE_EXTRA_CA_CERTS (сертификат прокси).',
    };
  }
}

export async function saveSupplierOrderNumber(fd: FormData): Promise<void> {
  await requireAdmin();

  const orderId = Number(fd.get('orderId'));
  if (!Number.isInteger(orderId) || orderId <= 0) redirect('/admin/orders');

  const number = String(fd.get('supplierOrderNumber') ?? '').trim().slice(0, 100);

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { supplierOrderedAt: true },
  });
  if (!order) redirect('/admin/orders');

  await prisma.order.update({
    where: { id: orderId },
    data: number
      ? // Отметку времени ставим один раз — при первом сохранении номера.
        { supplierOrderNumber: number, supplierOrderedAt: order.supplierOrderedAt ?? new Date() }
      : // Пустой номер = «ещё не заказан»: чистим и номер, и отметку.
        { supplierOrderNumber: '', supplierOrderedAt: null },
  });

  revalidatePath('/admin', 'layout');
  redirect(`/admin/orders/${orderId}`);
}
