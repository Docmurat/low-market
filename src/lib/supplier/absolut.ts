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
 *   SUPPLIER_MIN_INTERVAL_MS — пауза между запросами (по умолчанию 3200)
 */

// ---------- Типы ответов (по openapi.json поставщика и реальной пробе) ----------

export interface AbsolutQuantityStock {
  quantity: string | number; // приходит строкой: "12", "0", "> 10", "> 100"
  stock: string; // название склада, у нас — "MSK"
}

export interface AbsolutEvent {
  eventName: string;
  href: string;
}

/** GET /api/Catalogs/ProductSearch */
export interface AbsolutProduct {
  productId: number; // elko-код — наш supplierSku
  traceability?: string; // "N" / "Y" — прослеживаемость
  gism?: boolean; // маркировка Честный ЗНАК
  productName: string;
  manufacturerCode?: string; // партномер производителя
  vendorCode?: string; // код бренда (см. Vendors)
  categoryCode?: string;
  catalogTree?: string; // "Ноутбуки и компьютеры/Ноутбуки /Ноутбуки и аксессуары"
  paymentTerms?: string | null;
  paymentTermName?: string | null;
  lastUpdateDate?: string; // unix time строкой
  crossReference?: string;
  warranty?: string; // месяцы, строкой
  isEol?: boolean;
  isKitItem?: boolean;
  events?: AbsolutEvent[];
  isNew?: boolean;
  productPrice: number; // закупочная цена
  eanCodes?: string; // "-" если нет; несколько — через запятую
  inTransit?: AbsolutQuantityStock[];
  inStock?: AbsolutQuantityStock[];
  rrp?: number; // рекомендованная розничная цена (0/нет — не задана)
}

/** GET /api/Catalogs/AvailabilityAndPrice */
export interface AbsolutAvailability {
  productId: number;
  traceability?: string;
  gism?: boolean;
  price: number;
  rrp?: number;
  paymentTerms?: string | null;
  lastUpdateDate?: string;
  stockQuantity?: AbsolutQuantityStock[];
  inStock?: AbsolutQuantityStock[]; // на случай, если поставщик назовёт поле как в ProductSearch
  inTransit?: AbsolutQuantityStock[];
  eanCodes?: string[] | string;
}

/** GET /api/Catalogs/CategoryTree */
export interface AbsolutCategoryNode {
  id: number;
  parentId?: number;
  name: string;
  code: string | null; // у групп null; коды НЕ уникальны (CBL, NIC, MAS, SPE…)
  url?: string | null;
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
  measurement?: string | null; // ед. изм.
  complexName?: string | null; // группа характеристик
  value: string;
  lastUpdateDate?: string;
}
export interface AbsolutProductDescription {
  productId: number;
  description: AbsolutDescriptionLine[] | '' | null; // пустая строка, если характеристик нет
}

/** GET /api/Catalogs/MediaItems */
export interface AbsolutMediaLink {
  id?: number;
  mediaType: string; // "ThumbPicture" | "Picture"
  fullMediaLink: string; // бывает "" — пропускать
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
  /** Пауза между запросами, мс (лимиты поставщик не публикует; по аналогии с ELKO — 3,2 с) */
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
  /** Счётчик запросов — для оценки времени синка в логах */
  public requests = 0;

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
    this.requests++;
    const url = this.buildUrl(path, query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.token}`,
      Accept: 'application/json',
    };
    if (this.cfg.proxyKey) headers['X-Proxy-Key'] = this.cfg.proxyKey;

    let res: Response;
    let text: string;
    try {
      res = await fetch(url, { headers });
      text = await res.text();
    } catch (e) {
      // Сетевая ошибка (прокси недоступен, обрыв) — пробуем ещё несколько раз
      if (attempt <= 3) {
        await sleep(5000 * attempt);
        return this.request<T>(path, query, attempt + 1);
      }
      throw e;
    }

    if (res.ok) {
      return (text ? JSON.parse(text) : null) as T;
    }

    // Лимит частоты: 429 или 400 "Call limit exceeded"; 5xx — временная ошибка сервера
    const retriable =
      res.status === 429 || res.status >= 500 || (res.status === 400 && /limit/i.test(text));
    if (retriable && attempt <= 3) {
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

export type AbsolutNodeWithPath = AbsolutCategoryNode & { path: string[] };

/** Обходит дерево категорий и возвращает плоский список листьев (в них лежат товары). */
export function flattenLeafCategories(
  tree: AbsolutCategoryNode[] | AbsolutCategoryNode,
  path: string[] = [],
): AbsolutNodeWithPath[] {
  const nodes = Array.isArray(tree) ? tree : [tree];
  const out: AbsolutNodeWithPath[] = [];
  for (const node of nodes) {
    const here = [...path, node.name.trim()];
    if (node.childs && node.childs.length > 0) {
      out.push(...flattenLeafCategories(node.childs, here));
    } else {
      out.push({ ...node, path: here });
    }
  }
  return out;
}

/**
 * Все узлы дерева (не только листья) с указанием пути. Нужно, потому что код для
 * ProductSearch бывает у группы (напр. "Умный дом" [HAU]), а у её детей — null.
 */
export function flattenAllNodes(
  tree: AbsolutCategoryNode[] | AbsolutCategoryNode,
  path: string[] = [],
): AbsolutNodeWithPath[] {
  const nodes = Array.isArray(tree) ? tree : [tree];
  const out: AbsolutNodeWithPath[] = [];
  for (const node of nodes) {
    const here = [...path, node.name.trim()];
    out.push({ ...node, path: here });
    if (node.childs && node.childs.length > 0) {
      out.push(...flattenAllNodes(node.childs, here));
    }
  }
  return out;
}

/**
 * Разбор остатка. Поставщик присылает "0", "7", "> 10", "> 40", "> 100".
 * Возвращает число для сортировки (для "> N" берём N) и исходную метку для витрины.
 */
export function parseStock(items?: AbsolutQuantityStock[] | null): {
  quantity: number;
  label: string | null;
} {
  if (!items || items.length === 0) return { quantity: 0, label: null };
  let quantity = 0;
  let label: string | null = null;
  for (const it of items) {
    const raw = String(it.quantity ?? '').trim();
    const n = parseInt(raw.replace(/[^\d]/g, ''), 10);
    if (Number.isFinite(n)) quantity += n;
    if (raw.startsWith('>')) label = raw.replace(/\s+/g, ' ');
  }
  return { quantity, label };
}

/** Суммарный остаток по складам; строки вида "> 10" считаем как 10. */
export function totalStock(items?: AbsolutQuantityStock[] | null): number {
  return parseStock(items).quantity;
}

/** "6936520824113" | "a, b" | "-" | "" → массив без мусора */
export function parseEanCodes(raw?: string | string[] | null): string[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : String(raw).split(/[,;\s]+/);
  return parts.map((s) => s.trim()).filter((s) => s && s !== '-' && /^\d{8,14}$/.test(s));
}
