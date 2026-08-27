/**
 * Правила обработки дерева категорий поставщика и характеристик товаров.
 * Здесь всё, что правится руками: какие ветки не берём, какие характеристики
 * служебные и не показываются покупателю.
 */

/** Корневые ветки дерева поставщика, которые в наш каталог не попадают. */
export const JUNK_ROOT_PATTERNS: RegExp[] = [
  /^zzz/i, // "zzzНеИспользовать …"
  /^Рекламные материалы$/i,
  /^Услуги$/i,
  /^Комплекты$/i,
];

export function isJunkRoot(name: string): boolean {
  const n = name.trim();
  return JUNK_ROOT_PATTERNS.some((re) => re.test(n));
}

/**
 * Характеристики из Description, которые в карточке не показываем
 * (служебные, логистические, дубли других полей). В specs они сохраняются —
 * могут пригодиться для поиска/экспорта.
 */
export const HIDDEN_SPEC_KEYS: RegExp[] = [
  /^Image$/i,
  /^Kод ELKO$/i,
  /^Код ELKO$/i,
  /^Part Number$/i,
  /^EAN/i,
  /^Бренд$/i,
  /^Гарантия \(код\)$/i,
  /^Гарантия \(описание\)$/i,
  /^Объем(, м3)?$/i,
  /^Объем упаковки/i,
  /^Вес упаковки/i,
  /^Вес в упаковке/i,
  /^Количество в упаковке$/i,
  /^Long model codename$/i,
  /^Description$/i, // текст описания — переносится в product.description
  /^Новинка$/i,
  /^ЭДО \(РНПТ\)$/i,
  /^ESD$/i,
  /^Крупногабаритный товар$/i,
  /^Гарантия \(Наименование\)$/i,
  /^Упаковка$/i,
];

export function isHiddenSpec(key: string): boolean {
  const k = key.trim();
  return HIDDEN_SPEC_KEYS.some((re) => re.test(k));
}

/** Нормализация пути категории из фида: "Ноутбуки и компьютеры/Ноутбуки /Ноутбуки и аксессуары" */
export function normalizePath(path: string | string[]): string {
  const parts = Array.isArray(path) ? path : String(path).split('/');
  return parts
    .map((p) => p.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('/');
}

/** Транслитерация для slug (кириллица → латиница). */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return input
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
