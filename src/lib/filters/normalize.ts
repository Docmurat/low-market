/**
 * Нормализация значений характеристик поставщика для фильтров.
 * Сырые specs остаются как есть; здесь только приводим варианты записи
 * к одному виду: "16 Гб" / "16Гб" / "16GB" → "16 ГБ" (numValue = 16).
 */

export type Normalized = { value: string; numValue?: number } | null;

export type Normalizer =
  | 'text' // trim + схлопнуть пробелы, первая буква как есть
  | 'memory' // объём памяти: ГБ/ТБ/МБ → ГБ
  | 'number' // число: "2,1" → 2.1; "65.00" → 65
  | 'mhz' // частота, МГц (или ГГц → МГц)
  | 'pcie' // "PCIE 4.0 16x" / "PCI Express 5.0" → "PCIe 4.0"
  | 'bluetooth' // "Bluetooth 5.2" → "5.2"
  | 'yesno' // "да"/"нет"/"Да"/"Нет" → "Да"/"Нет"
  | 'resolution' // "1920x1080" / "1920 х 1080" → "1920×1080"
  | 'inch' // "15.6\"" / "15,6" → "15.6″"
  | 'color'; // цвета: единый регистр, "Black"→"Черный"

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function num(raw: string): number | null {
  const m = raw.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

const COLOR_MAP: Record<string, string> = {
  black: 'Черный', чёрный: 'Черный', черный: 'Черный',
  white: 'Белый', белый: 'Белый',
  gray: 'Серый', grey: 'Серый', серый: 'Серый', 'space gray': 'Серый', 'space grey': 'Серый',
  silver: 'Серебристый', серебристый: 'Серебристый', серебряный: 'Серебристый',
  blue: 'Синий', синий: 'Синий', голубой: 'Голубой',
  green: 'Зеленый', зеленый: 'Зеленый', зелёный: 'Зеленый',
  red: 'Красный', красный: 'Красный',
  gold: 'Золотистый', золотистый: 'Золотистый', золотой: 'Золотистый',
  pink: 'Розовый', розовый: 'Розовый',
  purple: 'Фиолетовый', фиолетовый: 'Фиолетовый',
  yellow: 'Желтый', желтый: 'Желтый', жёлтый: 'Желтый',
  orange: 'Оранжевый', оранжевый: 'Оранжевый',
  brown: 'Коричневый', коричневый: 'Коричневый',
  beige: 'Бежевый', бежевый: 'Бежевый',
};

export function normalize(kind: Normalizer, raw: string | undefined | null): Normalized {
  if (raw == null) return null;
  const s = clean(String(raw));
  if (!s || s === '-' || s === '—') return null;

  switch (kind) {
    case 'text': {
      return { value: s };
    }
    case 'yesno': {
      const l = s.toLowerCase();
      if (['да', 'yes', 'есть', '1', 'true'].includes(l)) return { value: 'Да', numValue: 1 };
      if (['нет', 'no', '0', 'false'].includes(l)) return { value: 'Нет', numValue: 0 };
      return { value: s };
    }
    case 'number': {
      const n = num(s);
      return n == null ? null : { value: fmtNum(n), numValue: n };
    }
    case 'memory': {
      const n = num(s);
      if (n == null) return null;
      const l = s.toLowerCase();
      let gb = n;
      if (/тб|tb|тбайт/.test(l)) gb = n * 1024;
      else if (/мб|mb|мбайт/.test(l) && !/гб|gb/.test(l)) gb = n / 1024;
      const value = gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024} ТБ` : gb < 1 ? `${fmtNum(gb * 1024)} МБ` : `${fmtNum(gb)} ГБ`;
      return { value, numValue: gb };
    }
    case 'mhz': {
      const n = num(s);
      if (n == null) return null;
      const l = s.toLowerCase();
      const mhz = /ггц|ghz/.test(l) || n < 20 ? n * 1000 : n;
      return { value: `${fmtNum(mhz / 1000)} ГГц`, numValue: mhz };
    }
    case 'pcie': {
      const m = s.match(/(\d(?:\.\d)?)/);
      if (!m) return { value: s };
      return { value: `PCIe ${m[1].includes('.') ? m[1] : m[1] + '.0'}`, numValue: Number(m[1]) };
    }
    case 'bluetooth': {
      const m = s.match(/(\d(?:\.\d)?)/);
      if (!m) return s.toLowerCase() === 'да' ? { value: 'Есть' } : { value: s };
      return { value: m[1], numValue: Number(m[1]) };
    }
    case 'resolution': {
      const m = s.match(/(\d{3,5})\s*[x×хX*]\s*(\d{3,5})/);
      if (!m) return { value: s };
      return { value: `${m[1]}×${m[2]}`, numValue: Number(m[1]) * Number(m[2]) };
    }
    case 'inch': {
      const n = num(s);
      if (n == null) return null;
      return { value: `${fmtNum(n)}″`, numValue: n };
    }
    case 'color': {
      const l = s.toLowerCase();
      const hit = COLOR_MAP[l];
      if (hit) return { value: hit };
      // "Тёмно-серый" и прочее: только первая заглавная
      return { value: s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() };
    }
  }
}

/** Значение `Description` от поставщика приходит с HTML-сущностями (&lt;p&gt;). */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}
