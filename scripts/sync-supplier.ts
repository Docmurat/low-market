/**
 * Синхронизация с API поставщика АБСОЛЮТ ТРЕЙД → наша БД.
 *
 * Режимы (первый аргумент):
 *   full    (по умолчанию) — дерево категорий → товары по всем категориям → цены/остатки
 *                            → деактивация пропавших → характеристики и фото для новых.
 *   prices  — лёгкий синк: только цена + остаток (AvailabilityAndPrice), быстро.
 *   specs   — только характеристики/фото для товаров, у которых их ещё нет.
 *
 * Опции:
 *   --category=NB     только одна категория поставщика (для проверки). Пропавшие НЕ деактивируются.
 *   --limit=50        обработать не более N товаров (для проверки).
 *   --refresh-specs   в режиме specs/full — перекачать характеристики у всех, а не только у новых.
 *   --no-specs        в режиме full — пропустить фазу характеристик (быстрая первая загрузка).
 *
 * Запуск [VSCode терминал] (VPN выключен, сертификат прокси выставлен):
 *   $env:NODE_EXTRA_CA_CERTS="C:\dev\voltshop\ops\nginx\supplier.crt"
 *   npx tsx scripts/sync-supplier.ts full --category=NB --limit=30
 *
 * Правила:
 *  - ключ товара — productId поставщика (supplierSku), upsert;
 *  - категории зеркалят дерево поставщика (ключ — supplierId), мусорные ветки не берём;
 *  - товар кладётся в категорию по catalogTree (коды категорий у поставщика НЕ уникальны);
 *  - розничная цена — матрица наценок (src/lib/pricing.ts), закупка с НДС;
 *  - пропавшие из фида и isEol — деактивируются, не удаляются;
 *  - description/images — защищённые поля: если у нас пусто, заполняем от поставщика,
 *    если уже есть — не трогаем; specs всегда обновляются из Description.
 *  - каждый прогон пишется в таблицу SyncLog (статус, счётчики, хвост лога) — для админки и алертов.
 */
import fs from 'node:fs';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  AbsolutClient,
  flattenAllNodes,
  parseEanCodes,
  parseStock,
  type AbsolutCategoryNode,
  type AbsolutNodeWithPath,
  type AbsolutProduct,
} from '../src/lib/supplier/absolut';
import { isJunkRoot, normalizePath, slugify } from '../src/lib/supplier/category-rules';
import { purchasePriceWithVat, retailPrice } from '../src/lib/pricing';
import { buildAttributes } from './build-attributes';
import { normalizeImages } from '../src/lib/supplier/media';

// ---------- .env без зависимостей ----------
function loadEnv(file = '.env') {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// ---------- аргументы ----------
type Mode = 'full' | 'prices' | 'specs';
interface Options {
  mode: Mode;
  category?: string;
  limit?: number;
  refreshSpecs: boolean;
  noSpecs: boolean;
}
function parseArgs(argv: string[]): Options {
  const opts: Options = { mode: 'full', refreshSpecs: false, noSpecs: false };
  for (const a of argv) {
    if (a === 'full' || a === 'prices' || a === 'specs') opts.mode = a;
    else if (a.startsWith('--category=')) opts.category = a.slice('--category='.length).trim();
    else if (a.startsWith('--limit=')) opts.limit = Number(a.slice('--limit='.length));
    else if (a === '--refresh-specs') opts.refreshSpecs = true;
    else if (a === '--no-specs') opts.noSpecs = true;
    else console.warn(`[sync] неизвестный аргумент: ${a}`);
  }
  return opts;
}

// ---------- статистика прогона (пишется в таблицу SyncLog) ----------
const stats = {
  fetched: 0,
  created: 0,
  updated: 0,
  skipped: 0,
  deactivated: 0,
  specsDone: 0,
  errors: 0,
};
const LOG_TAIL_LINES = 120;
const logLines: string[] = [];
function remember(line: string) {
  logLines.push(line);
  if (logLines.length > LOG_TAIL_LINES) logLines.shift();
}
const log = (msg: string) => {
  const line = `[sync ${new Date().toLocaleTimeString('ru-RU')}] ${msg}`;
  console.log(line);
  remember(line);
};
const logError = (msg: string) => {
  stats.errors++;
  console.error(msg);
  remember(msg);
};
const DETAILS_BATCH = Number(process.env.SUPPLIER_DETAILS_BATCH || 20);

type CategoryRow = {
  id: number;
  slug: string;
  parentId: number | null;
  markupPct: unknown;
  supplierPath: string | null;
};

// ---------- 1. Категории ----------

/**
 * Зеркалим дерево поставщика в таблицу Category. Возвращаем:
 *  - byPath: нормализованный путь → строка категории (для раскладки товаров);
 *  - chains: id категории → цепочка slug от листа к корню (для наценки);
 *  - codedNodes: узлы с кодом для ProductSearch (коды уникализированы).
 */
async function syncCategories(prisma: PrismaClient, tree: AbsolutCategoryNode[] | AbsolutCategoryNode) {
  const roots = (Array.isArray(tree) ? tree : [tree]).filter((r) => !isJunkRoot(r.name));
  const nodes = flattenAllNodes(roots);

  const existing = await prisma.category.findMany();
  const usedSlugs = new Set(existing.map((c) => c.slug));
  const bySupplierId = new Map<number, (typeof existing)[number]>();
  for (const c of existing) if (c.supplierId != null) bySupplierId.set(c.supplierId, c);

  const idByPath = new Map<string, number>(); // supplier path → our id
  let sort = 0;

  for (const node of nodes) {
    const pathKey = normalizePath(node.path);
    const parentKey = normalizePath(node.path.slice(0, -1));
    const parentId = node.path.length > 1 ? (idByPath.get(parentKey) ?? null) : null;
    const level = node.path.length - 1;
    const name = node.name.trim().replace(/\s+/g, ' ');
    const totalProducts = node.totalProducts ?? 0;

    let row = bySupplierId.get(node.id);
    if (!row) {
      // slug: имя; при коллизии — с родителем; потом — с id
      let slug = slugify(name) || `cat-${node.id}`;
      if (usedSlugs.has(slug) && parentId != null) {
        const parentSlug = existing.find((c) => c.id === parentId)?.slug
          ?? [...bySupplierId.values()].find((c) => c.id === parentId)?.slug;
        if (parentSlug) slug = `${parentSlug}-${slug}`;
      }
      if (usedSlugs.has(slug)) slug = `${slug}-${node.id}`;
      usedSlugs.add(slug);

      row = await prisma.category.create({
        data: {
          slug,
          name,
          parentId,
          level,
          sortOrder: sort,
          supplierId: node.id,
          supplierCode: node.code ?? null,
          supplierPath: pathKey,
          isActive: totalProducts > 0,
        },
      });
      bySupplierId.set(node.id, row);
      existing.push(row);
    } else {
      row = await prisma.category.update({
        where: { id: row.id },
        data: {
          name,
          parentId,
          level,
          sortOrder: sort,
          supplierCode: node.code ?? null,
          supplierPath: pathKey,
          isActive: totalProducts > 0,
        },
      });
      bySupplierId.set(node.id, row);
    }
    idByPath.set(pathKey, row.id);
    sort++;
  }

  // Узлы с кодом — по ним ходим в ProductSearch. Коды не уникальны: один код = один запрос.
  const seenCodes = new Set<string>();
  const codedNodes: AbsolutNodeWithPath[] = [];
  for (const n of nodes) {
    const code = (n.code ?? '').trim();
    if (!code || seenCodes.has(code)) continue;
    seenCodes.add(code);
    codedNodes.push(n);
  }

  const all = await prisma.category.findMany();
  const byId = new Map(all.map((c) => [c.id, c]));
  const byPath = new Map<string, CategoryRow>();
  for (const c of all) if (c.supplierPath) byPath.set(c.supplierPath, c);
  const chains = new Map<number, string[]>();
  for (const c of all) {
    const chain: string[] = [];
    let cur: (typeof all)[number] | undefined = c;
    while (cur) {
      chain.push(cur.slug);
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
    chains.set(c.id, chain);
  }

  log(`категорий в дереве: ${nodes.length}, кодов для загрузки: ${codedNodes.length}`);
  return { byPath, chains, codedNodes, byId };
}

/** Категория для товара по его catalogTree; если точного пути нет — ближайший предок. */
function resolveCategory(catalogTree: string | undefined, byPath: Map<string, CategoryRow>) {
  if (!catalogTree) return null;
  const parts = normalizePath(catalogTree).split('/');
  for (let i = parts.length; i > 0; i--) {
    const hit = byPath.get(parts.slice(0, i).join('/'));
    if (hit) return hit;
  }
  return null;
}

// ---------- 2. Товары ----------

function productSlug(brand: string, name: string, productId: number): string {
  const base = slugify(`${brand} ${name}`).slice(0, 80).replace(/-+$/, '');
  return `${base || 'tovar'}-${productId}`;
}

function toDate(unix?: string | null): Date | null {
  const n = Number(unix);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : null;
}

async function fetchAllProducts(api: AbsolutClient, codedNodes: AbsolutNodeWithPath[], only?: string) {
  const nodes = only ? codedNodes.filter((n) => n.code === only) : codedNodes;
  if (only && nodes.length === 0) throw new Error(`Категория с кодом ${only} не найдена в дереве`);
  const nonEmpty = nodes.filter((n) => (n.totalProducts ?? 0) > 0 || only);
  const eta = Math.round((nonEmpty.length * 3.3) / 60);
  log(`загрузка товаров: ${nonEmpty.length} категорий (~${eta} мин)`);

  const byId = new Map<number, AbsolutProduct>();
  let i = 0;
  for (const node of nonEmpty) {
    i++;
    try {
      const items = await api.productSearch({ categoryCodes: [node.code as string] });
      for (const p of items ?? []) byId.set(p.productId, p);
      if (i % 10 === 0 || only) log(`  ${i}/${nonEmpty.length} ${node.path.join('/')} [${node.code}] → ${items?.length ?? 0}`);
    } catch (e) {
      logError(`  ОШИБКА категории ${node.code}: ${(e as Error).message}`);
    }
  }
  log(`уникальных товаров получено: ${byId.size}`);
  stats.fetched = byId.size;
  return byId;
}

async function upsertProducts(
  prisma: PrismaClient,
  products: AbsolutProduct[],
  vendors: Map<string, string>,
  cats: Awaited<ReturnType<typeof syncCategories>>,
) {
  const seen: string[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const counts = new Map<number, number>();

  // Артикул → защищена ли категория (выставляется в админке: «ручная категория»).
  const lockedBySku = new Map(
    (await prisma.product.findMany({ select: { supplierSku: true, categoryLocked: true } })).map(
      (p) => [p.supplierSku, p.categoryLocked] as const,
    ),
  );

  for (const p of products) {
    const category = resolveCategory(p.catalogTree, cats.byPath);
    if (!category) {
      remember(`  пропущен #${p.productId}: категория не найдена для "${p.catalogTree}"`);
      console.warn(`  пропущен #${p.productId}: категория не найдена для "${p.catalogTree}"`);
      skipped++;
      continue;
    }
    const chain = cats.chains.get(category.id) ?? [category.slug];
    const brand = (p.vendorCode && vendors.get(p.vendorCode)) || '';
    const basePrice = purchasePriceWithVat(Number(p.productPrice) || 0);
    const price = retailPrice(basePrice, chain, category.markupPct != null ? Number(category.markupPct) : null);
    const { quantity, label } = parseStock(p.inStock);
    const sku = String(p.productId);
    const isEol = Boolean(p.isEol);
    const warranty = parseInt(String(p.warranty ?? ''), 10);
    const rrp = Number(p.rrp) > 0 ? Number(p.rrp) : null;

    const common = {
      name: p.productName.trim(),
      brand,
      basePrice,
      price,
      rrp,
      stock: isEol ? 0 : quantity,
      stockLabel: label,
      stocks: (p.inStock ?? []) as unknown as Prisma.InputJsonValue,
      isActive: !isEol,
      categoryId: category.id,
      vendorCode: p.vendorCode ?? null,
      manufacturerCode: p.manufacturerCode ?? null,
      supplierCategoryCode: p.categoryCode ?? null,
      eanCodes: parseEanCodes(p.eanCodes),
      warrantyMonths: Number.isFinite(warranty) ? warranty : null,
      gism: Boolean(p.gism),
      traceability: String(p.traceability ?? 'N').toUpperCase() === 'Y',
      isEol,
      isNew: Boolean(p.isNew),
      supplierUpdatedAt: toDate(p.lastUpdateDate),
      syncedAt: new Date(),
    };

    if (lockedBySku.has(sku)) {
      // description/images/specs не трогаем — их ведёт фаза specs и наш контент.
      // categoryLocked=true (категория переложена вручную в админке) → категорию
      // тоже не трогаем: цена/остаток обновляются, полка остаётся наша.
      let data: typeof common | Omit<typeof common, 'categoryId'> = common;
      if (lockedBySku.get(sku)) {
        const { categoryId: _keepManual, ...withoutCategory } = common;
        data = withoutCategory;
      }
      await prisma.product.update({ where: { supplierSku: sku }, data });
      updated++;
    } else {
      await prisma.product.create({
        data: { ...common, supplierSku: sku, slug: productSlug(brand, p.productName, p.productId) },
      });
      created++;
    }
    seen.push(sku);
    counts.set(category.id, (counts.get(category.id) ?? 0) + 1);
  }

  // Счётчики товаров по категориям (только для затронутых)
  for (const [id, n] of counts) {
    await prisma.category.update({ where: { id }, data: { productCount: n, isActive: n > 0 } });
  }

  log(`товары: создано ${created}, обновлено ${updated}, пропущено ${skipped}`);
  stats.created = created;
  stats.updated = updated;
  stats.skipped = skipped;
  return seen;
}

// ---------- 3. Характеристики и фото ----------

function specsFromDescription(lines: { criteria: string; value: string; measurement?: string | null }[] | '' | null | undefined) {
  const specs: Record<string, string> = {};
  if (!Array.isArray(lines)) return specs;
  for (const l of lines) {
    const key = (l.criteria ?? '').trim();
    let value = (l.value ?? '').toString().trim();
    if (!key || !value) continue;
    if (l.measurement) value = `${value} ${l.measurement}`.trim();
    specs[key] = value;
  }
  return specs;
}

async function syncSpecs(prisma: PrismaClient, api: AbsolutClient, opts: Options) {
  const where: Prisma.ProductWhereInput = { isActive: true };
  if (!opts.refreshSpecs) where.specsSyncedAt = null;
  if (opts.category) where.supplierCategoryCode = opts.category;

  const targets = await prisma.product.findMany({
    where,
    select: { id: true, supplierSku: true, images: true, description: true },
    orderBy: { id: 'asc' },
    ...(opts.limit ? { take: opts.limit } : {}),
  });
  if (targets.length === 0) {
    log('характеристики: нечего обновлять');
    return;
  }
  const batches = Math.ceil(targets.length / DETAILS_BATCH);
  log(`характеристики/фото: ${targets.length} товаров, ${batches} пачек по ${DETAILS_BATCH} (~${Math.round((batches * 2 * 3.3) / 60)} мин)`);

  let done = 0;
  for (let b = 0; b < batches; b++) {
    const batch = targets.slice(b * DETAILS_BATCH, (b + 1) * DETAILS_BATCH);
    const ids = batch.map((t) => Number(t.supplierSku));
    try {
      const descRaw = await api.descriptions(ids);
      const mediaRaw = await api.mediaItems(ids);
      const descs = new Map((Array.isArray(descRaw) ? descRaw : [descRaw]).filter(Boolean).map((d) => [d.productId, d]));
      const medias = new Map((Array.isArray(mediaRaw) ? mediaRaw : [mediaRaw]).filter(Boolean).map((m) => [m.productId, m]));

      for (const t of batch) {
        const pid = Number(t.supplierSku);
        const specs = specsFromDescription(descs.get(pid)?.description);
        const links = medias.get(pid)?.mediaLinks ?? [];
        // Превью первым, затем галерея; пустые ссылки и дубли убираем
        const thumb = links.filter((l) => l.mediaType === 'ThumbPicture').map((l) => l.fullMediaLink);
        const pics = links.filter((l) => l.mediaType !== 'ThumbPicture').map((l) => l.fullMediaLink);
                const images = normalizeImages([...thumb, ...pics]);

        const data: Prisma.ProductUpdateInput = {
          specs: specs as Prisma.InputJsonValue,
          specsSyncedAt: new Date(),
        };
        if (t.images.length === 0 && images.length > 0) data.images = images; // защищённое поле
        await prisma.product.update({ where: { id: t.id }, data });
      }
      done += batch.length;
      stats.specsDone = done;
      if ((b + 1) % 10 === 0 || b === batches - 1) log(`  характеристики: ${done}/${targets.length}`);
    } catch (e) {
      logError(`  ОШИБКА пачки ${b + 1}/${batches} (${ids[0]}…): ${(e as Error).message}`);
    }
  }
}

// ---------- 4. Лёгкий синк цен/остатков ----------

async function syncPrices(prisma: PrismaClient, api: AbsolutClient, opts: Options) {
  const cats = await prisma.category.findMany({
    where: { supplierCode: { not: null }, ...(opts.category ? { supplierCode: opts.category } : {}) },
  });
  const seenCodes = new Set<string>();
  const codes = cats
    .filter((c) => c.productCount > 0 || opts.category)
    .map((c) => c.supplierCode as string)
    .filter((code) => (seenCodes.has(code) ? false : (seenCodes.add(code), true)));

  const byId = new Map(
    (await prisma.category.findMany()).map((c) => [c.id, c]),
  );
  const chainOf = (id: number) => {
    const chain: string[] = [];
    let cur = byId.get(id);
    while (cur) {
      chain.push(cur.slug);
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  };

  log(`цены/остатки: ${codes.length} категорий (~${Math.round((codes.length * 3.3) / 60)} мин)`);
  let updated = 0;
  let i = 0;
  for (const code of codes) {
    i++;
    try {
      const rows = await api.availabilityAndPrice({ categoryCodes: [code] });
      for (const r of rows ?? []) {
        const product = await prisma.product.findUnique({
          where: { supplierSku: String(r.productId) },
          select: { id: true, categoryId: true, isEol: true },
        });
        if (!product) continue;
        const cat = byId.get(product.categoryId);
        const basePrice = purchasePriceWithVat(Number(r.price) || 0);
        const price = retailPrice(basePrice, chainOf(product.categoryId), cat?.markupPct != null ? Number(cat.markupPct) : null);
        const { quantity, label } = parseStock(r.stockQuantity ?? r.inStock);
        await prisma.product.update({
          where: { id: product.id },
          data: {
            basePrice,
            price,
            rrp: Number(r.rrp) > 0 ? Number(r.rrp) : null,
            stock: product.isEol ? 0 : quantity,
            stockLabel: label,
            stocks: ((r.stockQuantity ?? r.inStock ?? []) as unknown) as Prisma.InputJsonValue,
            gism: r.gism ?? undefined,
            syncedAt: new Date(),
          },
        });
        updated++;
      }
      if (i % 20 === 0) log(`  ${i}/${codes.length}, обновлено ${updated}`);
    } catch (e) {
      logError(`  ОШИБКА категории ${code}: ${(e as Error).message}`);
    }
  }
  log(`цены/остатки: обновлено ${updated}`);
  stats.updated = updated;
}

// ---------- Оркестрация ----------

export async function syncFromSupplier(prisma: PrismaClient, opts: Options = { mode: 'full', refreshSpecs: false, noSpecs: false }) {
  loadEnv();
  const started = Date.now();
  const args = [
    opts.category ? `--category=${opts.category}` : '',
    opts.limit ? `--limit=${opts.limit}` : '',
    opts.refreshSpecs ? '--refresh-specs' : '',
    opts.noSpecs ? '--no-specs' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const run = await prisma.syncLog.create({ data: { mode: opts.mode, args } });

  let api: AbsolutClient | undefined;
  try {
    api = new AbsolutClient();
    await runSync(prisma, api, opts);
    await prisma.syncLog.update({
      where: { id: run.id },
      data: { ...stats, status: 'ok', finishedAt: new Date(), apiRequests: api.requests, log: logLines.join('\n'),
        message: stats.errors > 0 ? `завершено с ${stats.errors} ошибками по категориям/пачкам` : '' },
    });
    log(`готово за ${Math.round((Date.now() - started) / 60000)} мин, запросов к API: ${api.requests}, ошибок: ${stats.errors}, лог #${run.id}`);
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    remember(`ФАТАЛЬНО: ${msg}`);
    await prisma.syncLog.update({
      where: { id: run.id },
      data: { ...stats, status: 'error', finishedAt: new Date(), apiRequests: api?.requests ?? 0, message: msg.slice(0, 1000), log: logLines.join('\n') },
    });
    throw e;
  }
}

async function runSync(prisma: PrismaClient, api: AbsolutClient, opts: Options) {
  const me = await api.accountsMy();
  log(`API OK: ${me.username} (${me.company?.name ?? '—'}), режим ${opts.mode}${opts.category ? `, категория ${opts.category}` : ''}${opts.limit ? `, лимит ${opts.limit}` : ''}`);

  if (opts.mode === 'prices') {
    await syncPrices(prisma, api, opts);
  } else if (opts.mode === 'specs') {
    await syncSpecs(prisma, api, opts);
    await buildAttributes(prisma);
  } else {
    const tree = await api.categoryTree();
    const cats = await syncCategories(prisma, tree);

    const vendorList = await api.vendors();
    const vendors = new Map(vendorList.map((v) => [v.vendorCode, v.vendorName.trim()]));
    log(`вендоров: ${vendors.size}`);

    const fetched = await fetchAllProducts(api, cats.codedNodes, opts.category);
    let products = [...fetched.values()];
    if (opts.limit) products = products.slice(0, opts.limit);

    const seen = await upsertProducts(prisma, products, vendors, cats);

    // Деактивация пропавших — только при полном обходе без ограничений
    if (!opts.category && !opts.limit) {
      const gone = await prisma.product.updateMany({
        where: { supplierSku: { notIn: seen }, isActive: true },
        data: { isActive: false, stock: 0 },
      });
      log(`деактивировано пропавших: ${gone.count}`);
      stats.deactivated = gone.count;
    }

    if (!opts.noSpecs) {
      await syncSpecs(prisma, api, opts);
      await buildAttributes(prisma);
    }
  }
}

// Запуск напрямую: npm run sync [full|prices|specs] [--category=NB] [--limit=30]
if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  syncFromSupplier(prisma, parseArgs(process.argv.slice(2)))
    .catch((e) => {
      console.error('ОШИБКА:', e?.message ?? e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}