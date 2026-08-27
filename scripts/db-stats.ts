/**
 * Быстрая статистика каталога после синка.
 * Запуск [VSCode терминал]: npx tsx scripts/db-stats.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.product.count();
  const active = await prisma.product.count({ where: { isActive: true } });
  const inStock = await prisma.product.count({ where: { isActive: true, stock: { gt: 0 } } });
  const noSpecs = await prisma.product.count({ where: { specsSyncedAt: null } });
  const emptySpecs = await prisma.product.count({ where: { specs: { equals: {} } } });
  const noImages = await prisma.product.count({ where: { images: { isEmpty: true } } });
  const gism = await prisma.product.count({ where: { gism: true } });
  const eol = await prisma.product.count({ where: { isEol: true } });
  const noBrand = await prisma.product.count({ where: { brand: '' } });
  const withRrp = await prisma.product.count({ where: { rrp: { not: null } } });
    const withDesc = await prisma.product.count({ where: { description: { not: '' } } });
  const aboveRrp = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "Product" WHERE rrp IS NOT NULL AND price > rrp`;
  const cats = await prisma.category.count();
  const catsActive = await prisma.category.count({ where: { isActive: true } });

  console.log(`Товаров всего:              ${total}`);
  console.log(`  активных:                 ${active}`);
  console.log(`  в наличии (stock>0):      ${inStock}`);
  console.log(`  без синка характеристик:  ${noSpecs}`);
  console.log(`  с пустыми specs:          ${emptySpecs}`);
  console.log(`  без фото:                 ${noImages}`);
  console.log(`  Честный ЗНАК:             ${gism}`);
  console.log(`  EOL:                      ${eol}`);
  console.log(`  без бренда:               ${noBrand}`);
    console.log(`  с описанием:              ${withDesc}`); 
  console.log(`  с РРЦ:                    ${withRrp}, из них наша цена выше РРЦ: ${Number(aboveRrp[0].n)}`);
  console.log(`Категорий: ${cats}, активных: ${catsActive}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());