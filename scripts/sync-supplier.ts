/**
 * Синхронизация ассортимента: API поставщика -> наша БД.
 *
 * Сейчас читает data/supplier-mock.json. На шаге 6 заменим источник
 * на реальный HTTP-запрос (SUPPLIER_API_URL + SUPPLIER_API_KEY),
 * но контракт останется тем же: SupplierItem[].
 *
 * Правила:
 *  - товар ищется по supplierSku (upsert);
 *  - розничная цена считается матрицей наценок (src/lib/pricing.ts);
 *  - товары, пропавшие из фида, деактивируются (isActive=false), не удаляются;
 *  - неизвестная категория -> товар пропускается с записью в лог.
 */
import type { PrismaClient } from '@prisma/client';
import { retailPrice } from '../src/lib/pricing';
import fs from 'node:fs';
import path from 'node:path';

export type SupplierItem = {
  sku: string;
  name: string;
  brand: string;
  category: string; // slug категории
  purchase_price: number;
  stock: number;
  specs?: Record<string, string>;
  images?: string[];
  description?: string;
};

function slugify(input: string): string {
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

async function fetchSupplierItems(): Promise<SupplierItem[]> {
  // TODO шаг 6: если задан SUPPLIER_API_URL — ходим в реальный API.
  const raw = fs.readFileSync(path.join(process.cwd(), 'data', 'supplier-mock.json'), 'utf-8');
  return JSON.parse(raw).items as SupplierItem[];
}

export async function syncFromSupplier(prisma: PrismaClient) {
  const items = await fetchSupplierItems();
  const categories = await prisma.category.findMany();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));

  const seenSkus: string[] = [];
  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const category = bySlug.get(item.category);
    if (!category) {
      console.warn(`[sync] Пропущен ${item.sku}: неизвестная категория "${item.category}"`);
      skipped++;
      continue;
    }

    const price = retailPrice(
      item.purchase_price,
      category.slug,
      category.markupPct ? Number(category.markupPct) : null,
    );
    const slug = `${slugify(item.brand)}-${slugify(item.name)}-${slugify(item.sku)}`;

    await prisma.product.upsert({
      where: { supplierSku: item.sku },
      update: {
        name: item.name,
        brand: item.brand,
        basePrice: item.purchase_price,
        price,
        stock: item.stock,
        specs: item.specs ?? {},
        categoryId: category.id,
        isActive: true,
        // ВАЖНО: description и images НЕ перезаписываем при обновлении —
        // это «защищённые поля» с нашим контентом поверх данных поставщика.
      },
      create: {
        supplierSku: item.sku,
        slug,
        name: item.name,
        brand: item.brand,
        description: item.description ?? '',
        basePrice: item.purchase_price,
        price,
        stock: item.stock,
        specs: item.specs ?? {},
        images: item.images ?? [],
        categoryId: category.id,
      },
    });
    seenSkus.push(item.sku);
    updated++;
  }

  // Всё, чего нет в фиде, — снимаем с витрины
  const deactivated = await prisma.product.updateMany({
    where: { supplierSku: { notIn: seenSkus } },
    data: { isActive: false, stock: 0 },
  });

  console.log(
    `[sync] Обновлено: ${updated}, пропущено: ${skipped}, деактивировано: ${deactivated.count}`,
  );
}

// Запуск напрямую: npm run sync
if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  syncFromSupplier(prisma)
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
