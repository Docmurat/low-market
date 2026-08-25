/**
 * Матрица наценок по категориям (из бизнес-плана).
 * Приоритет: markupPct у категории в БД > матрица по slug > DEFAULT_MARKUP.
 * Правило floor: розничная цена не может опуститься ниже
 * закупка * (1 + эквайринг + буфер).
 */

export const MARKUP_MATRIX: Record<string, number> = {
  videokarty: 8,
  protsessory: 8,
  'materinskie-platy': 9,
  noutbuki: 10,
  'gotovye-pk': 12,
  monitory: 12,
  'ssd-nakopiteli': 15,
  'operativnaya-pamyat': 15,
  'bloki-pitaniya': 16,
  korpusa: 18,
  periferiya: 22,
  'setevoe-oborudovanie': 18,
  'krupnaya-bytovaya-tehnika': 12,
  'melkaya-bytovaya-tehnika': 20,
  'kabeli-i-aksessuary': 45,
};

export const DEFAULT_MARKUP = 15; // %
export const ACQUIRING_PCT = 2;   // эквайринг
export const SAFETY_PCT = 3;      // буфер на логистику/риски

export function markupFor(categorySlug: string, override?: number | null): number {
  return override ?? MARKUP_MATRIX[categorySlug] ?? DEFAULT_MARKUP;
}

/** Розничная цена: наценка → floor-контроль → «красивое» окончание на 90. */
export function retailPrice(
  basePrice: number,
  categorySlug: string,
  categoryMarkupOverride?: number | null,
): number {
  const markup = markupFor(categorySlug, categoryMarkupOverride);
  const target = basePrice * (1 + markup / 100);
  const floor = basePrice * (1 + (ACQUIRING_PCT + SAFETY_PCT) / 100);

  let price = Math.max(target, floor);

  // Окончание "…90": округляем вверх до сотни и отнимаем 10.
  // Например 51 234 → 51 290. Если провалились под floor — простое округление вверх.
  const pretty = Math.ceil(price / 100) * 100 - 10;
  price = pretty >= floor ? pretty : Math.ceil(price);

  return price;
}
