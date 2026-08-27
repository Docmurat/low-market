/**
 * Конфиг фильтров по категориям.
 *
 * Ключ — slug нашей категории (любого уровня); фильтры ищутся по цепочке
 * лист → родитель → корень, берётся первый найденный конфиг + COMMON_FILTERS.
 * `sources` — какие ключи из Product.specs поставщика считать этой характеристикой
 * (у поставщика один и тот же смысл записан по-разному в разных категориях).
 * Фильтр "brand" особый: берётся из Product.brand, а не из specs.
 */
import type { Normalizer } from './normalize';

export interface FilterDef {
  key: string; // id фильтра, попадает в URL: ?ram=16
  label: string; // подпись в UI
  sources: string[]; // ключи specs поставщика (пусто для brand)
  normalize: Normalizer;
  type?: 'checkbox' | 'range'; // по умолчанию checkbox
  unit?: string; // для range
}

/** Фильтры, доступные во всех категориях. Цена и наличие — не атрибуты, они в UI отдельно. */
export const COMMON_FILTERS: FilterDef[] = [{ key: 'brand', label: 'Бренд', sources: [], normalize: 'text' }];

export const CATEGORY_FILTERS: Record<string, FilterDef[]> = {
  noutbuki: [
    { key: 'cpu_series', label: 'Процессор', sources: ['Серия процессора', 'Процессор'], normalize: 'text' },
    { key: 'ram', label: 'Оперативная память', sources: ['Оперативная память', 'Объем оперативной памяти'], normalize: 'memory' },
    { key: 'ssd', label: 'Накопитель SSD', sources: ['Объем накопителя SSD', 'Объем SSD'], normalize: 'memory' },
    { key: 'screen', label: 'Диагональ', sources: ['Размер экрана', 'Диагональ экрана'], normalize: 'inch' },
    { key: 'resolution', label: 'Разрешение экрана', sources: ['Номинальное разрешение экрана', 'Разрешение экрана'], normalize: 'resolution' },
    { key: 'gpu', label: 'Видеокарта', sources: ['Графический адаптер'], normalize: 'text' },
    { key: 'os', label: 'Операционная система', sources: ['Операционная система'], normalize: 'text' },
    { key: 'color', label: 'Цвет', sources: ['Цвет'], normalize: 'color' },
  ],
  videokarty: [
    { key: 'gpu_chip', label: 'Графический процессор', sources: ['Чипсет', 'Графический процессор'], normalize: 'text' },
    { key: 'vram', label: 'Объём видеопамяти', sources: ['Обьем памяти видеокарты, ГБ', 'Объем памяти видеокарты, ГБ', 'Объем видеопамяти'], normalize: 'memory' },
    { key: 'vram_type', label: 'Тип памяти', sources: ['Тип памяти'], normalize: 'text' },
    { key: 'bus', label: 'Шина памяти, бит', sources: ['Шина объема с памятью', 'Разрядность шины памяти'], normalize: 'number' },
    { key: 'pcie', label: 'Интерфейс', sources: ['Тип подключения', 'Интерфейс'], normalize: 'pcie' },
    { key: 'power_conn', label: 'Разъёмы питания', sources: ['Разъемы питания'], normalize: 'text' },
    { key: 'tdp', label: 'Потребляемая мощность, Вт', sources: ['Потребляемая мощность, Вт'], normalize: 'number', type: 'range', unit: 'Вт' },
  ],
  protsessory: [
    { key: 'socket', label: 'Сокет', sources: ['Socket', 'Сокет'], normalize: 'text' },
    { key: 'cores', label: 'Количество ядер', sources: ['Количество ядер'], normalize: 'number' },
    { key: 'freq', label: 'Базовая частота', sources: ['Частота процессора'], normalize: 'mhz' },
    { key: 'turbo', label: 'Частота Turbo', sources: ['Частота процессора в режиме Turbo'], normalize: 'mhz' },
    { key: 'ram_type', label: 'Тип памяти', sources: ['Тип оперативной памяти'], normalize: 'text' },
    { key: 'tdp', label: 'Тепловыделение, Вт', sources: ['Тепловыделение'], normalize: 'number', type: 'range', unit: 'Вт' },
    { key: 'igpu', label: 'Встроенная графика', sources: ['Интегрированное графическое ядро'], normalize: 'yesno' },
  ],
  'materinskie-platy': [
    { key: 'socket', label: 'Сокет', sources: ['Socket', 'Сокет'], normalize: 'text' },
    { key: 'chipset', label: 'Чипсет', sources: ['Чипсет'], normalize: 'text' },
    { key: 'form_factor', label: 'Форм-фактор', sources: ['Форм-фактор', 'Формфактор'], normalize: 'text' },
    { key: 'ram_type', label: 'Тип памяти', sources: ['Тип оперативной памяти', 'Тип памяти'], normalize: 'text' },
  ],
  'moduli-pamyati': [
    { key: 'ram_type', label: 'Тип памяти', sources: ['Тип оперативной памяти', 'Тип памяти'], normalize: 'text' },
    { key: 'ram', label: 'Объём', sources: ['Объем памяти', 'Оперативная память', 'Объем'], normalize: 'memory' },
    { key: 'freq', label: 'Частота', sources: ['Частота работы оперативной памяти', 'Частота'], normalize: 'mhz' },
  ],
  'nakopiteli-ssd': [
    { key: 'capacity', label: 'Объём', sources: ['Объем накопителя', 'Объем', 'Емкость'], normalize: 'memory' },
    { key: 'iface', label: 'Интерфейс', sources: ['Интерфейс', 'Тип подключения'], normalize: 'text' },
    { key: 'form_factor', label: 'Форм-фактор', sources: ['Форм-фактор', 'Формфактор'], normalize: 'text' },
  ],
  monitory: [
    { key: 'screen', label: 'Диагональ', sources: ['Размер экрана', 'Диагональ экрана', 'Диагональ'], normalize: 'inch' },
    { key: 'resolution', label: 'Разрешение', sources: ['Номинальное разрешение экрана', 'Разрешение экрана', 'Разрешение'], normalize: 'resolution' },
    { key: 'panel', label: 'Тип матрицы', sources: ['Тип матрицы', 'Тип экрана'], normalize: 'text' },
    { key: 'refresh', label: 'Частота обновления', sources: ['Частота обновления', 'Частота обновления экрана'], normalize: 'number' },
  ],
  'smartfony-i-gadzhety': [
    { key: 'ram', label: 'Оперативная память', sources: ['Оперативная память', 'Объем оперативной памяти'], normalize: 'memory' },
    { key: 'storage', label: 'Встроенная память', sources: ['Встроенная память', 'Объем встроенной памяти', 'Объем накопителя'], normalize: 'memory' },
    { key: 'screen_type', label: 'Тип экрана', sources: ['Тип экрана'], normalize: 'text' },
    { key: 'os', label: 'Операционная система', sources: ['Операционная система'], normalize: 'text' },
    { key: 'color', label: 'Цвет', sources: ['Цвет'], normalize: 'color' },
  ],
  televizory: [
    { key: 'screen', label: 'Диагональ', sources: ['Размер экрана', 'Диагональ экрана', 'Диагональ'], normalize: 'inch' },
    { key: 'resolution', label: 'Разрешение', sources: ['Номинальное разрешение экрана', 'Разрешение экрана', 'Разрешение'], normalize: 'resolution' },
    { key: 'smart', label: 'Smart TV', sources: ['Smart TV'], normalize: 'yesno' },
  ],
  'bytovaya-tehnika': [{ key: 'color', label: 'Цвет', sources: ['Цвет'], normalize: 'color' }],
};

/** Фильтры для категории по цепочке slug (лист → корень). */
export function filtersForChain(slugChain: string[]): FilterDef[] {
  for (const slug of slugChain) {
    const f = CATEGORY_FILTERS[slug];
    if (f) return [...COMMON_FILTERS, ...f];
  }
  return COMMON_FILTERS;
}
