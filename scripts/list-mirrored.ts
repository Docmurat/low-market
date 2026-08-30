/**
 * Показывает товары, чьи фото уже зеркалированы в наш Object Storage:
 * артикул, название, сколько фото наших/всего и ссылку на карточку на сайте.
 *
 * Запуск [VSCode терминал]:  npx tsx scripts/list-mirrored.ts
 * Показать больше строк:      npx tsx scripts/list-mirrored.ts --limit=50
 */
import './load-env';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 10;

  const endpoint = (process.env.S3_ENDPOINT || '').replace(/\/+$/, '');
  const bucket = process.env.S3_BUCKET || '';
  const prefix = `${endpoint}/${bucket}/`;
  if (!endpoint || !bucket) {
    console.error('S3_ENDPOINT/S3_BUCKET не заполнены в .env');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { images: { isEmpty: false } },
    select: { supplierSku: true, name: true, brand: true, slug: true, images: true },
    orderBy: [{ stock: 'desc' }, { id: 'asc' }], // тот же порядок, что у зеркалирования
    take: 500,
  });

  const mirrored = products.filter((p) => p.images.some((u) => u.startsWith(prefix)));
  console.log(`Товаров с нашими фото (среди первых 500 по остатку): ${mirrored.length}\n`);

  for (const p of mirrored.slice(0, limit)) {
    const ours = p.images.filter((u) => u.startsWith(prefix)).length;
    console.log(`${p.supplierSku} · ${p.brand} ${p.name}`);
    console.log(`  наших фото: ${ours} из ${p.images.length}`);
    console.log(`  http://localhost:3000/product/${p.slug}\n`);
  }
  if (mirrored.length > limit) {
    console.log(`…и ещё ${mirrored.length - limit}. Больше: --limit=${mirrored.length}`);
  }
}

main()
  .catch((e) => {
    console.error('ОШИБКА:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());