/**
 * Пересчёт розничных цен для всех товаров по текущим правилам pricing.ts —
 * без обращения к API (basePrice берём из базы).
 * Запускать после правки .env (FLAT_MARKUP_PCT) или матрицы наценок.
 *
 * Запуск [VSCode терминал]: npx tsx scripts/reprice.ts
 */
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { retailPrice, flatMarkupPct } from '../src/lib/pricing';

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

const prisma = new PrismaClient();

async function main() {
  loadEnv();
  const flat = flatMarkupPct();
  console.log(flat != null ? `Режим: плоская наценка ${flat}%` : 'Режим: матрица по категориям');

  const cats = await prisma.category.findMany();
  const byId = new Map(cats.map((c) => [c.id, c]));
  const chainOf = (id: number) => {
    const chain: string[] = [];
    let cur = byId.get(id);
    while (cur) {
      chain.push(cur.slug);
      cur = cur.parentId != null ? byId.get(cur.parentId) : undefined;
    }
    return chain;
  };

  const products = await prisma.product.findMany({
    select: { id: true, basePrice: true, price: true, categoryId: true },
  });
  let changed = 0;
  for (const p of products) {
    const cat = byId.get(p.categoryId);
    const price = retailPrice(
      Number(p.basePrice),
      chainOf(p.categoryId),
      cat?.markupPct != null ? Number(cat.markupPct) : null,
    );
    if (price !== Number(p.price)) {
      await prisma.product.update({ where: { id: p.id }, data: { price } });
      changed++;
    }
  }
  console.log(`Пересчитано: ${products.length}, изменилось: ${changed}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());