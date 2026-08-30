/**
 * Чистка мёртвых ссылок на фото: «стучится» в каждую ссылку каждого товара
 * и удаляет из товара только ГАРАНТИРОВАННО мёртвые (ответ 404/410).
 * Сомнительные (таймаут, ошибка сети, прочие коды) НЕ трогает — лучше оставить
 * живое, чем удалить лишнее; повторный запуск доберёт.
 *
 * Запуск [VSCode терминал], из корня проекта, VPN выключить:
 *   npx tsx scripts/check-images.ts --dry --limit=200   — проба без удаления
 *   npx tsx scripts/check-images.ts *> data\check-images.log   — полный прогон
 *
 * Скрипт безопасен при повторных запусках. Имеет смысл прогонять после
 * full/--refresh-specs синка: тем товарам, где модератор фото не трогал
 * (imagesLocked=false) и всё было удалено как мёртвое, синк мог долить
 * ссылки поставщика заново.
 */
import './load-env';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TIMEOUT_MS = 8_000;
const UA = 'Mozilla/5.0 (compatible; LOW-Market image checker)';
/** Сколько ссылок одного товара проверяем параллельно. */
const PER_PRODUCT_PARALLEL = 6;

type Verdict = 'alive' | 'dead' | 'unsure';

async function probe(url: string, method: 'HEAD' | 'GET'): Promise<number | null> {
  try {
    const res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': UA, ...(method === 'GET' ? { Range: 'bytes=0-0' } : {}) },
    });
    // Тело не нужно — только статус; для GET с Range его почти и нет
    if (method === 'GET') await res.arrayBuffer().catch(() => undefined);
    return res.status;
  } catch {
    return null; // сеть/таймаут — не приговор
  }
}

async function checkUrl(url: string): Promise<Verdict> {
  let status = await probe(url, 'HEAD');
  // Некоторые серверы не умеют HEAD (405/501) или капризничают — перепроверяем GET-ом
  if (status === null || status === 405 || status === 501 || status === 403) {
    status = await probe(url, 'GET');
  }
  if (status === null) return 'unsure';
  if (status === 404 || status === 410) return 'dead';
  if (status >= 200 && status < 400) return 'alive';
  return 'unsure';
}

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;

  const products = await prisma.product.findMany({
    where: { images: { isEmpty: false } },
    select: { id: true, supplierSku: true, images: true },
    orderBy: { id: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  const totalLinks = products.reduce((s, p) => s + p.images.length, 0);
  console.log(
    `Товаров с фото: ${products.length}, ссылок: ${totalLinks}.` +
      (dry ? ' РЕЖИМ ПРОБЫ (--dry): ничего не удаляем.' : ''),
  );

  // Одинаковые ссылки встречаются у разных товаров — проверяем каждую один раз
  const cache = new Map<string, Verdict>();
  let checked = 0;
  let dead = 0;
  let unsure = 0;
  let changedProducts = 0;
  let emptied = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const verdicts: Verdict[] = new Array(p.images.length);

    for (let start = 0; start < p.images.length; start += PER_PRODUCT_PARALLEL) {
      const slice = p.images.slice(start, start + PER_PRODUCT_PARALLEL);
      const results = await Promise.all(
        slice.map(async (url) => {
          const hit = cache.get(url);
          if (hit) return hit;
          const v = await checkUrl(url);
          cache.set(url, v);
          checked++;
          return v;
        }),
      );
      results.forEach((v, j) => (verdicts[start + j] = v));
    }

    const alive = p.images.filter((_, j) => verdicts[j] !== 'dead');
    const deadHere = p.images.length - alive.length;
    dead += deadHere;
    unsure += verdicts.filter((v) => v === 'unsure').length;

    if (deadHere > 0) {
      changedProducts++;
      if (alive.length === 0) emptied++;
      if (dry) {
        console.log(`  [проба] ${p.supplierSku}: удалил бы ${deadHere} из ${p.images.length}`);
      } else {
        await prisma.product.update({ where: { id: p.id }, data: { images: { set: alive } } });
      }
    }

    if ((i + 1) % 200 === 0 || i === products.length - 1) {
      console.log(
        `  ${i + 1}/${products.length} товаров · проверено ссылок: ${checked} · мёртвых: ${dead}`,
      );
    }
  }

  console.log('--- ИТОГО ---');
  console.log(`Мёртвых ссылок ${dry ? 'нашлось (не удалял, --dry)' : 'удалено'}: ${dead}`);
  console.log(`Товаров затронуто: ${changedProducts}, из них остались совсем без фото: ${emptied}`);
  console.log(`Сомнительных (оставлены как есть): ${unsure}`);
  console.log(
    emptied > 0 && !dry
      ? 'Товары без фото появились в панели /moder/photos — на замену модератору.'
      : 'Готово.',
  );
}

main()
  .catch((e) => {
    console.error('ОШИБКА:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
