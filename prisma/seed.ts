/**
 * Сид: дерево категорий + загрузка демо-товаров через тот же пайплайн,
 * что будет работать с реальным API поставщика (scripts/sync-supplier.ts).
 */
import { PrismaClient } from '@prisma/client';
import { syncFromSupplier } from '../scripts/sync-supplier';

const prisma = new PrismaClient();

const TREE: Array<{ slug: string; name: string; children?: Array<{ slug: string; name: string }> }> = [
  {
    slug: 'komplektuyushchie',
    name: 'Комплектующие',
    children: [
      { slug: 'videokarty', name: 'Видеокарты' },
      { slug: 'protsessory', name: 'Процессоры' },
      { slug: 'materinskie-platy', name: 'Материнские платы' },
      { slug: 'ssd-nakopiteli', name: 'SSD-накопители' },
      { slug: 'operativnaya-pamyat', name: 'Оперативная память' },
      { slug: 'bloki-pitaniya', name: 'Блоки питания' },
      { slug: 'korpusa', name: 'Корпуса' },
    ],
  },
  { slug: 'noutbuki', name: 'Ноутбуки' },
  { slug: 'monitory', name: 'Мониторы' },
  { slug: 'periferiya', name: 'Периферия' },
  { slug: 'setevoe-oborudovanie', name: 'Сетевое оборудование' },
  {
    slug: 'bytovaya-tehnika',
    name: 'Бытовая техника',
    children: [
      { slug: 'krupnaya-bytovaya-tehnika', name: 'Крупная бытовая техника' },
      { slug: 'melkaya-bytovaya-tehnika', name: 'Мелкая бытовая техника' },
    ],
  },
  { slug: 'kabeli-i-aksessuary', name: 'Кабели и аксессуары' },
];

async function main() {
  let sort = 0;
  for (const root of TREE) {
    const parent = await prisma.category.upsert({
      where: { slug: root.slug },
      update: { name: root.name, sortOrder: sort },
      create: { slug: root.slug, name: root.name, sortOrder: sort },
    });
    sort++;
    for (const child of root.children ?? []) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: parent.id },
        create: { slug: child.slug, name: child.name, parentId: parent.id },
      });
    }
  }
  console.log('Категории созданы.');

  await syncFromSupplier(prisma);
  console.log('Демо-товары загружены через пайплайн синхронизации.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
