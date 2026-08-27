/**
 * Нормализация ссылок на фото поставщика.
 *  - относительные пути "/upload/iblock/…" → https://ecom.absoluttrade.ru/upload/…
 *  - пустые и дубли убираем;
 *  - если один и тот же файл (по имени) есть и на selstorage.ru (там часто 404),
 *    и на ecom.absoluttrade.ru — оставляем только ecom.
 */
export const SUPPLIER_MEDIA_BASE = (process.env.SUPPLIER_MEDIA_BASE || 'https://ecom.absoluttrade.ru').replace(/\/+$/, '');

export function absolutizeMediaUrl(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `${SUPPLIER_MEDIA_BASE}${s}`;
  return `${SUPPLIER_MEDIA_BASE}/${s}`;
}

function fileName(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop()?.toLowerCase() ?? url;
  } catch {
    return url;
  }
}

export function normalizeImages(urls: Array<string | null | undefined>): string[] {
  const abs = urls.map((u) => absolutizeMediaUrl(u ?? '')).filter((u): u is string => !!u);
  const byName = new Map<string, string>();
  const order: string[] = [];
  for (const u of abs) {
    const name = fileName(u);
    const prev = byName.get(name);
    if (!prev) {
      byName.set(name, u);
      order.push(name);
      continue;
    }
    // Предпочитаем ecom.absoluttrade.ru перед selstorage
    const prevIsStorage = /selstorage\.ru/i.test(prev);
    const curIsEcom = /absoluttrade\.ru/i.test(u);
    if (prevIsStorage && curIsEcom) byName.set(name, u);
  }
  return order.map((n) => byName.get(n) as string);
}