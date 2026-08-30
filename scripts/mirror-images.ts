/**
 * Зеркалирование фото: скачивает картинки поставщика, прогоняет через нашу
 * обработку (webp, максимум 1200×1200) и заливает в наш Object Storage,
 * подменяя ссылки в товаре. Порядок фото сохраняется (первое = главное).
 *
 * Правила надёжности:
 *  - ссылки, уже ведущие в наш бакет, не трогаются → скрипт можно запускать
 *    сколько угодно раз, он продолжит с недоделанного;
 *  - скачивание умерло с 404/410 → ссылка выбрасывается (файла больше нет);
 *  - прочие сбои (таймаут, 5xx) → ссылка ОСТАЁТСЯ как была, доберём следующим
 *    запуском; imagesLocked НЕ ставим — это работа машины, а не модератора.
 *
 * Запуск [VSCode терминал], из корня проекта, VPN выключить:
 *   npx tsx scripts/mirror-images.ts --limit=50            — проба
 *   npx tsx scripts/mirror-images.ts *> data\mirror.log    — полный прогон (часы)
 *
 * После full/--refresh-specs синка запускать снова: новым товарам синк даёт
 * ссылки поставщика — зеркалим их сюда же.
 */
import './load-env';
import { PrismaClient } from '@prisma/client';
import { processProductImage } from '../src/lib/image-process';
import { uploadToStorage, isStorageConfigured } from '../src/lib/storage';

const prisma = new PrismaClient();

const TIMEOUT_MS = 20_000;
const UA = 'Mozilla/5.0 (compatible; LOW-Market image mirror)';
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

function ourPrefix(): string {
  const endpoint = (process.env.S3_ENDPOINT || '').replace(/\/+$/, '');
  const bucket = process.env.S3_BUCKET || '';
  return `${endpoint}/${bucket}/`;
}

type MirrorResult =
  | { kind: 'ours'; url: string }
  | { kind: 'mirrored'; url: string; bytes: number }
  | { kind: 'dead' }
  | { kind: 'kept'; url: string }; // временный сбой — оставили ссылку поставщика

async function mirrorOne(sku: string, url: string, index: number): Promise<MirrorResult> {
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': UA },
    });
  } catch {
    return { kind: 'kept', url };
  }
  if (res.status === 404 || res.status === 410) return { kind: 'dead' };
  if (!res.ok) return { kind: 'kept', url };

  let source: Buffer;
  try {
    source = Buffer.from(await res.arrayBuffer());
  } catch {
    return { kind: 'kept', url };
  }
  if (source.length === 0 || source.length > MAX_SOURCE_BYTES) return { kind: 'dead' };

  let processed: Buffer;
  try {
    processed = await processProductImage(source);
  } catch {
    // Скачалось, но это не картинка (страница-заглушка и т.п.) — мусор
    return { kind: 'dead' };
  }

  try {
    const key = `products/${sku}/s${index}-${Date.now()}.webp`;
    const publicUrl = await uploadToStorage(key, processed, 'image/webp');
    return { kind: 'mirrored', url: publicUrl, bytes: processed.length };
  } catch {
    // Бакет не ответил — оставляем ссылку поставщика, доберём потом
    return { kind: 'kept', url };
  }
}

async function main() {
  if (!isStorageConfigured()) {
    console.error('Хранилище не настроено: заполните S3_* в .env.');
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : undefined;
  const prefix = ourPrefix();

  const all = await prisma.product.findMany({
    where: { images: { isEmpty: false } },
    select: { id: true, supplierSku: true, images: true },
    orderBy: [{ stock: 'desc' }, { id: 'asc' }], // ходовые зеркалим первыми
  });
  const targets = all.filter((p) => p.images.some((u) => !u.startsWith(prefix)));
  const queue = limit ? targets.slice(0, limit) : targets;
  console.log(
    `Товаров с чужими ссылками: ${targets.length} из ${all.length} с фото. Берём: ${queue.length}.`,
  );

  let mirrored = 0;
  let dead = 0;
  let kept = 0;
  let bytes = 0;

  for (let i = 0; i < queue.length; i++) {
    const p = queue[i];
    const results = await Promise.all(
      p.images.map((u, j) =>
        u.startsWith(prefix)
          ? Promise.resolve<MirrorResult>({ kind: 'ours', url: u })
          : mirrorOne(p.supplierSku, u, j),
      ),
    );

    const newImages: string[] = [];
    for (const r of results) {
      if (r.kind === 'dead') {
        dead++;
        continue;
      }
      if (r.kind === 'mirrored') {
        mirrored++;
        bytes += r.bytes;
      }
      if (r.kind === 'kept') kept++;
      newImages.push(r.url);
    }

    if (JSON.stringify(newImages) !== JSON.stringify(p.images)) {
      await prisma.product.update({ where: { id: p.id }, data: { images: { set: newImages } } });
    }

    if ((i + 1) % 100 === 0 || i === queue.length - 1) {
      console.log(
        `  ${i + 1}/${queue.length} товаров · зеркалировано: ${mirrored} (${(bytes / 1024 / 1024).toFixed(1)} МБ) · мёртвых выброшено: ${dead} · отложено из-за сбоев: ${kept}`,
      );
    }
  }

  console.log('--- ИТОГО ---');
  console.log(`Зеркалировано фото: ${mirrored}, занято в бакете: ${(bytes / 1024 / 1024).toFixed(1)} МБ`);
  console.log(`Выброшено мёртвых/не-картинок: ${dead}`);
  console.log(
    kept > 0
      ? `Отложено из-за временных сбоев: ${kept} — просто запустите скрипт ещё раз позже.`
      : 'Сбоев нет — всё чисто.',
  );
}

main()
  .catch((e) => {
    console.error('ОШИБКА:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
