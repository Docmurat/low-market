/**
 * Клиент API поставщика АБСОЛЮТ ТРЕЙД (eCommerce API v3).
 * Документация: https://api.absoluttrade.ru/local/docs/api/client/index.php
 *
 * Локально запросы идут через nginx-прокси на нашем сервере (его IP в белом
 * списке поставщика); на проде SUPPLIER_API_URL = https://api.absoluttrade.ru.
 * Переменные окружения:
 *   SUPPLIER_API_URL   — базовый адрес (без завершающего /)
 *   SUPPLIER_API_TOKEN — Bearer-токен (действует 1 год; повторный CreateToken
 *                        обнуляет старый — поэтому клиент его НЕ создаёт)
 *   SUPPLIER_PROXY_KEY — секрет прокси (только для локальной разработки)
 */

// ---------- Типы ответов (по openapi.json поставщика) ----------

export interface AbsolutQuantityStock {
  quantity: string; // приходит строкой, напр. "12" или ">10"
  stock: string; // название склада
}

export interface AbsolutEvent {
  eventName: string;
  href: string;
}

/** GET /api/Catalogs/ProductSearch */
export interface AbsolutProduct {
  productId: number; // elko-код — наш supplierSku
  traceability?: string; // признак прослеживаемости
  gism?: boolean; // маркировка Честный ЗНАК
  productName: string;
  manufacturerCode?: string; // партномер производителя
  vendorCode?: string; // код бренда
  categoryCode?: string;
  catalogTree?: string; // "Комплектующие / Видеокарты"
  paymentTerms?: string;
  paymentTermName?: string;
  lastUpdateDate?: string;
  crossReference?: string;
  warranty?: string; // месяцы, строкой
  isEol?: boolean;
  isKitItem?: boolean;
  events?: AbsolutEvent[];
  isNew?: boolean;
  productPrice: number; // закупочная цена
  eanCodes?: string;
  inTransit?: AbsolutQuantityStock[];
  inStock?: AbsolutQuantityStock[];
  rrp?: number; // рекомендованная розничная цена
}

/** GET /api/Catalogs/AvailabilityAndPrice */
export interface AbsolutAvailability {
  productId: number;
  traceability?: string;
  gism?: boolean;
  price: number;
  rrp?: number;
  paymentTerms?: string;
  lastUpdateDate?: string;
  stockQuantity?: AbsolutQuantityStock[];
  inTransit?: AbsolutQuantityStock[];
  eanCodes?: string[];
}

/** GET /api/Catalogs/CategoryTree */
export interface AbsolutCategoryNode {
  id: number;
  parentId?: number;
  name: string;
  code: string;
  url?: string;
  totalProducts?: number;
  childs?: AbsolutCategoryNode[];
}

/** GET /api/Catalogs/Vendors */
export interface AbsolutVendor {
  vendorName: string;
  vendorCode: string;
}

/** GET /api/Catalogs/Products/{ids}/Description */
export interface AbsolutDescriptionLine {
  criteria: string; // название характеристики
  measurement?: string; // ед. изм.
  complexName?: string; // группа характеристик
  value: string;
  lastUpdateDate?: string;
}
export interface AbsolutProductDescription {
  productId: number;
  description: AbsolutDescriptionLine[];
}

/** GET /api/Catalogs/MediaItems */
export interface AbsolutMediaLink {
  mediaType: string;
  fullMediaLink: string;
}
export interface AbsolutMediaItem {
  productId: number;
  mediaLinks: AbsolutMediaLink[];
}

/** GET /api/Accounts/My */
export interface AbsolutAccount {
  name: string;
  username: string;
  company?: { name: string };
  emails?: string[];
}

// ---------- Конфигурация ----------

export interface AbsolutConfig {
  baseUrl: string;
  token: string;
  proxyKey?: string;
  /** Пауза между запросами, мс (у ELKO лимит: не чаще 1 раза в 3 с) */
  minIntervalMs: number;
}

export function getAbsolutConfig(): AbsolutConfig {
  const baseUrl = (process.env.SUPPLIER_API_URL || '').replace(/\/+$/, '');
  const token = process.env.SUPPLIER_API_TOKEN || '';
  if (!baseUrl) throw new Error('SUPPLIER_API_URL не задан в .env');
  if (!token) throw new Error('SUPPLIER_API_TOKEN не задан в .env');
  return {
    baseUrl,
    token,
    proxyKey: process.env.SUPPLIER_PROXY_KEY || undefined,
    minIntervalMs: Number(process.env.SUPPLIER_MIN_INTERVAL_MS || 3200),
  };
}

// ---------- Клиент ----------

type QueryValue = string | number | boolean | undefined | Array<string | number>;
type Query = Record<string, QueryValue>;

export class AbsolutApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    public body: string,
  ) {
    super(`Absolut API ${status} ${path}: ${body.slice(0, 300)}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class AbsolutClient {
  private lastRequestAt = 0;

  constructor(private cfg: AbsolutConfig = getAbsolutConfig()) {}

  // --- служебное ---

  private buildUrl(path: string, query?: Query): string {
    const url = new URL(this.cfg.baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === '') continue;
        // collectionFormat=multi: массив → повтор параметра
        if (Array.isArray(value)) {
          for (const v of value) url.searchParams.append(key, String(v));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async throttle() {
    const wait = this.lastRequestAt + this.cfg.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private async request<T>(path: string, query?: Query, attempt = 1): Promise<T> {
    await this.throttle();
    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.token}`,
      Accept: 'application/json',
    };
    if (this.cfg.proxyKey) headers['X-Proxy-Key'] = this.cfg.proxyKey;

    const res = await fetch(url, { headers });
    const text = await res.text();

    if (res.ok) {
      return (text ? JSON.parse(text) : null) as T;
    }

    // Лимит частоты: поставщик отвечает 400 "Call limit exceeded" или 429
    const rateLimited = res.status === 429 || (res.status === 400 && /limit/i.test(text));
    if (rateLimited && attempt <= 3) {
      await sleep(3500 * attempt);
      return this.request<T>(path, query, attempt + 1);
    }
    throw new AbsolutApiError(res.status, path, text);
  }

  // --- методы ---

  accountsMy() {
    return this.request<AbsolutAccount>('/api/Accounts/My');
  }

  categoryTree() {
    return this.request<AbsolutCategoryNode[] | AbsolutCategoryNode>('/api/Catalogs/CategoryTree');
  }

  vendors() {
    return this.request<AbsolutVendor[]>('/api/Catalogs/Vendors');
  }

  productSearch(params: {
    categoryCodes?: string[];
    vendorCodes?: string[];
    productIds?: number[];
    gism?: boolean;
    fromDateUpdate?: number;
    pattern?: string;
  }) {
    return this.request<AbsolutProduct[]>('/api/Catalogs/ProductSearch', params);
  }

  availabilityAndPrice(params: {
    productIds?: number[];
    categoryCodes?: string[];
    vendorCodes?: string[];
    fromDateUpdate?: number;
  }) {
    return this.request<AbsolutAvailability[]>('/api/Catalogs/AvailabilityAndPrice', params);
  }

  /** Характеристики. Поставщик принимает несколько id в пути через запятую. */
  descriptions(productIds: number[]) {
    const ids = productIds.join(',');
    return this.request<AbsolutProductDescription[] | AbsolutProductDescription>(
      `/api/Catalogs/Products/${ids}/Description`,
    );
  }

  mediaItems(productIds: number[]) {
    return this.request<AbsolutMediaItem[] | AbsolutMediaItem>('/api/Catalogs/MediaItems', {
      productIds,
    });
  }
}

// ---------- Утилиты ----------

/** Обходит дерево категорий и возвращает плоский список листьев (в них лежат товары). */
export function flattenLeafCategories(
  tree: AbsolutCategoryNode[] | AbsolutCategoryNode,
  path: string[] = [],
): Array<AbsolutCategoryNode & { path: string[] }> {
  const nodes = Array.isArray(tree) ? tree : [tree];
  const out: Array<AbsolutCategoryNode & { path: string[] }> = [];
  for (const node of nodes) {
    const here = [...path, node.name];
    if (node.childs && node.childs.length > 0) {
      out.push(...flattenLeafCategories(node.childs, here));
    } else {
      out.push({ ...node, path: here });
    }
  }
  return out;
}

/** Суммарный остаток по складам; строки вида ">10" считаем как 10. */
export function totalStock(items?: AbsolutQuantityStock[]): number {
  if (!items) return 0;
  return items.reduce((sum, it) => {
    const n = parseInt(String(it.quantity).replace(/[^\d]/g, ''), 10);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}