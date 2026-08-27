/**
 * Проверка правил кросс-продаж: для каждого правила показывает, какие категории
 * подходят под `when` и под каждый `show`, и сколько там товаров в наличии.
 * Помогает подправить регулярки под реальные названия категорий поставщика.
 *
 * Запуск [VSCode терминал]:  npx tsx scripts/crosssell-check.ts
 */
import { PrismaClient } from '@prisma/client';
import { CROSS_SELL_RULES } from '../src/lib/crosssell/config';
import { categoryIdsMatching } from '../src/lib/crosssell/query';

const prisma = new PrismaClient();

async function main() {
  const cats = await prisma.category.findMany({ select: { id: true, name: true, parentId: true, isActive: true } });
  const active = cats.filter((c) => c.isActive);
  console.log(`категорий: ${cats.length}, активных: ${active.length}\n`);

  for (const rule of CROSS_SELL_RULES) {
    const when = active.filter((c) => rule.when.test(c.name.trim()));
    console.log(`=== ${rule.id}  when=${rule.when}`);
    console.log(`  источники (${when.length}): ${when.map((c) => c.name).join(' | ') || '— НЕТ СОВПАДЕНИЙ'}`);
    for (const re of rule.show) {
      const ids = categoryIdsMatching(cats, re);
      const names = active.filter((c) => re.test(c.name.trim())).map((c) => c.name);
      const inStock = ids.length ? await prisma.product.count({ where: { isActive: true, stock: { gt: 0 }, gism: false, categoryId: { in: ids } } }) : 0;
      const flag = inStock === 0 ? '  ⚠' : '   ';
      console.log(`${flag} show ${re}  → категорий ${names.length}, товаров в наличии ${inStock}${names.length ? `: ${names.slice(0, 4).join(' | ')}${names.length > 4 ? ' …' : ''}` : ''}`);
    }
    console.log();
  }

  // Категории с товарами, которые не попали ни в одно правило как источник
  const covered = new Set<number>();
  for (const rule of CROSS_SELL_RULES) for (const id of categoryIdsMatching(cats, rule.when)) covered.add(id);
  const uncovered = await prisma.category.findMany({
    where: { isActive: true, productCount: { gt: 0 }, id: { notIn: [...covered] } },
    select: { name: true, productCount: true },
    orderBy: { productCount: 'desc' },
    take: 25,
  });
  console.log('Крупные категории без правила (на них будет только блок «Похожие»):');
  for (const c of uncovered) console.log(`  ${String(c.productCount).padStart(5)}  ${c.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
