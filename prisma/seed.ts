/**
 * Сид = первая полная синхронизация с поставщиком.
 * Демо-дерева и мок-данных больше нет: категории и товары приходят из API.
 *
 * Запуск [VSCode терминал] (VPN выключен, сертификат прокси выставлен):
 *   $env:NODE_EXTRA_CA_CERTS="C:\dev\voltshop\ops\nginx\supplier.crt"
 *   npm run seed
 * Это то же самое, что `npm run sync full`.
 */
import { PrismaClient } from '@prisma/client';
import { syncFromSupplier } from '../scripts/sync-supplier';

const prisma = new PrismaClient();

syncFromSupplier(prisma, { mode: 'full', refreshSpecs: false, noSpecs: false })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
