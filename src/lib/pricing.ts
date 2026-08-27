/**
 * Ценообразование.
 *
 * РЕЖИМ СЕЙЧАС: плоская наценка FLAT_MARKUP_PCT из .env (пока 10%) поверх цены
 * поставщика как есть. Матрица по категориям, потолок РРЦ и НДС — отложены
 * до прояснения схемы расчётов с поставщиком (нал/безнал, НДС по категориям).
 * Чтобы включить матрицу — убрать FLAT_MARKUP_PCT из .env и прогнать scripts/reprice.ts.
 *
 * Матрица (когда включим): ключ — slug категории, поиск по цепочке лист → родитель → корень
 * → DEFAULT_MARKUP; markupPct у категории в БД сильнее матрицы.
 * Floor: цена не ниже закупка * (1 + эквайринг + буфер). Окончание цены …90.
 */

export const MARKUP_MATRIX: Record<string, number> = {
  // --- Комплектующие ---
  komplektuyushchie: 15,
  videokarty: 8,
  protsessory: 8,
  'materinskie-platy': 9,
  'nakopiteli-ssd': 15,
  'moduli-pamyati': 15,
  'zhestkie-diski': 12,
  'bloki-pitaniya': 16,
  korpusa: 18,
  'ustroystva-ohlazhdeniya': 20,
  'opticheskie-privody': 20,

  // --- Ноутбуки и компьютеры ---
  'noutbuki-i-kompyutery': 12,
  noutbuki: 10,
  kompyutery: 12,
  monitory: 12,
  'nositeli-informatsii': 18,
  orgtehnika: 12,
  'rashodnye-materialy': 25,
  'klaviatury-i-myshi': 22,
  'veb-kamery': 22,
  'ibp-setevye-filtry': 18,
  'kabeli-i-perehodniki': 45,
  'igrovye-aksessuary': 18,

  // --- Сети / серверы ---
  'setevoe-oborudovanie': 18,
  'servernoe-oborudovanie': 10,

  // --- Смартфоны и гаджеты ---
  'smartfony-i-gadzhety': 10,
  'mobilnye-telefony': 8,
  planshety: 10,
  gadzhety: 12,
  'aksessuary-dlya-smartfonov': 35,
  'zaryadnye-ustroystva': 30,

  // --- ТВ и аудио ---
  'televizory-i-audio': 12,
  televizory: 10,
  naushniki: 20,
  audiotehnika: 15,

  // --- Бытовая техника ---
  'bytovaya-tehnika': 15,
  'krupnaya-bytovaya-tehnika': 12,
  'vstraivaemaya-tehnika': 12,
  'tehnika-dlya-kuhni': 20,
  'tehnika-dlya-doma': 18,
  'shveynye-mashiny-i-overloki': 15,

  // --- Прочее ---
  'krasota-i-zdorove': 20,
  'programmnoe-obespechenie': 12,
  'bezopasnost-i-videonablyudenie': 20,
  'klimaticheskaya-tehnika': 15,
  'sadovaya-tehnika': 15,
  'stroitelstvo-i-remont': 18,
  avtotovary: 25,
  'umnyy-dom': 18,
};

export const DEFAULT_MARKUP = 15; // %
export const ACQUIRING_PCT = 2; // эквайринг
export const SAFETY_PCT = 3; // буфер на логистику/риски

/** Плоская наценка из .env (FLAT_MARKUP_PCT=10). Если не задана — работает матрица. */
export function flatMarkupPct(): number | null {
  const v = process.env.FLAT_MARKUP_PCT;
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** НДС: пока не накручиваем. Оставлено на будущее (SUPPLIER_PRICES_INCLUDE_VAT=false, VAT_PCT). */
export function supplierPricesIncludeVat(): boolean {
  const v = (process.env.SUPPLIER_PRICES_INCLUDE_VAT ?? 'true').trim().toLowerCase();
  return !(v === 'false' || v === '0' || v === 'no');
}
export function vatPct(): number {
  const n = Number(process.env.VAT_PCT ?? 22);
  return Number.isFinite(n) ? n : 22;
}
export function purchasePriceWithVat(supplierPrice: number): number {
  if (supplierPricesIncludeVat()) return round2(supplierPrice);
  return round2(supplierPrice * (1 + vatPct() / 100));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Наценка для товара.
 * @param slugChain цепочка slug от листа к корню
 * @param override  markupPct категории из БД (сильнее матрицы, но слабее плоской наценки)
 */
export function markupFor(slugChain: string | string[], override?: number | null): number {
  const flat = flatMarkupPct();
  if (flat != null) return flat;
  if (override != null) return override;
  const chain = Array.isArray(slugChain) ? slugChain : [slugChain];
  for (const slug of chain) {
    const m = MARKUP_MATRIX[slug];
    if (m != null) return m;
  }
  return DEFAULT_MARKUP;
}

/** Розничная цена: наценка → floor-контроль → «красивое» окончание на 90. */
export function retailPrice(
  basePrice: number,
  slugChain: string | string[],
  categoryMarkupOverride?: number | null,
): number {
  const markup = markupFor(slugChain, categoryMarkupOverride);
  const target = basePrice * (1 + markup / 100);
  const floor = basePrice * (1 + (ACQUIRING_PCT + SAFETY_PCT) / 100);

  let price = Math.max(target, floor);

  // Окончание "…90": округляем вверх до сотни и отнимаем 10.
  const pretty = Math.ceil(price / 100) * 100 - 10;
  price = pretty >= floor ? pretty : Math.ceil(price);

  return price;
}