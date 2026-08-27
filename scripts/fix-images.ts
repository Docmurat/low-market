/**
 * Починка ссылок на фото в базе: относительные → абсолютные, дубли selstorage/ecom → ecom.
 * Запуск [VSCode терминал]: npx tsx scripts/fix-images.ts
 */
import { PrismaClient } from '@prisma/client';
import { normalizeImages } from '../src/lib/supplier/media';

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { images: { isEmpty: false } },
    select: { id: true, images: true },
  });
  let changed = 0;
  for (const p of products) {
    const fixed = normalizeImages(p.images);
    if (JSON.stringify(fixed) !== JSON.stringify(p.images)) {
      await prisma.product.update({ where: { id: p.id }, data: { images: fixed } });
      changed++;
    }
  }
  console.log(`Товаров с фото: ${products.length}, исправлено: ${changed}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());