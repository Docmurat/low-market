/**
 * Расчёт доставки (шаг 8). Чистые функции без серверных импортов.
 * Единственная точка входа — calcDelivery(): её зовут страница подтверждения
 * (показать цену покупателю) и placeOrder (посчитать для заказа и чека).
 * ВАЖНО: обе стороны должны передавать ОДНИ И ТЕ ЖЕ данные (цены/закупки из БД),
 * чтобы покупатель на экране и в платеже видел одну и ту же цифру.
 *
 * Модель (временная, см. config.ts): зона по полю «город» (Москва / всё
 * остальное = МО) × габаритный класс (по названию категории) = тариф.
 * Бесплатно — только курьером, только без крупногабарита и только когда
 * сумма ≥ порога И тариф ≤ доли маржи заказа. Самовывоз бесплатный.
 * Захотим другую модель (км, API службы доставки) — переписываем этот файл,
 * сигнатура calcDelivery остаётся.
 */
import {
  BULKY_CATEGORY_PATTERNS,
  DELIVERY_TARIFFS_RUB,
  FREE_DELIVERY_FROM_RUB,
  FREE_DELIVERY_MAX_MARGIN_SHARE,
  PICKUP_IS_FREE,
} from './config';

export type DeliveryZone = keyof typeof DELIVERY_TARIFFS_RUB; // 'msk' | 'mo'

export type DeliveryQuoteItem = {
  priceRub: number; // розница
  baseRub: number; // закупка (для правила маржи)
  qty: number;
  categoryName: string; // название категории ('' если нет — считаем обычным)
};

export type DeliveryQuote = {
  costRub: number; // что платит покупатель (0 = бесплатно)
  free: boolean; // сработало ли правило бесплатной доставки
  zone: DeliveryZone | null; // null для самовывоза
  bulky: boolean; // есть ли крупногабарит в заказе
};

export function detectZone(city: string): DeliveryZone {
  return /москва/i.test(city.trim()) ? 'msk' : 'mo';
}

/**
 * Зона по ОФИЦИАЛЬНОМУ региону из адресной подсказки DaData (задача 8b):
 * 'г Москва' → msk, 'Московская обл' → mo, всё прочее → null (курьером не возим —
 * parseCheckout не пустит такой адрес дальше). Пустой регион (ручной ввод без
 * подсказок) → null, и calcDelivery откатывается на detectZone по городу.
 * ("москва" не подстрока "московская" — порядок проверок безопасен.)
 */
export function regionToZone(region: string): DeliveryZone | null {
  const r = region.trim();
  if (!r) return null;
  if (/москва/i.test(r)) return 'msk';
  if (/московск/i.test(r)) return 'mo';
  return null;
}

export function isBulkyCategory(categoryName: string): boolean {
  return BULKY_CATEGORY_PATTERNS.some((re) => re.test(categoryName));
}

export function calcDelivery(input: {
  method: 'courier' | 'pickup';
  city: string;
  region?: string; // официальный регион из подсказки DaData ('' = не было подсказки)
  items: DeliveryQuoteItem[];
}): DeliveryQuote {
  if (input.method === 'pickup') {
    return { costRub: PICKUP_IS_FREE ? 0 : 0, free: true, zone: null, bulky: false };
  }

  const zone = regionToZone(input.region ?? '') ?? detectZone(input.city);
  const bulky = input.items.some((it) => isBulkyCategory(it.categoryName));
  const tariff = DELIVERY_TARIFFS_RUB[zone][bulky ? 'bulky' : 'regular'];

  const subtotal = input.items.reduce((s, it) => s + it.priceRub * it.qty, 0);
  const margin = input.items.reduce((s, it) => s + (it.priceRub - it.baseRub) * it.qty, 0);

  const free =
    !bulky &&
    subtotal >= FREE_DELIVERY_FROM_RUB &&
    tariff <= margin * FREE_DELIVERY_MAX_MARGIN_SHARE;

  return { costRub: free ? 0 : tariff, free, zone, bulky };
}
