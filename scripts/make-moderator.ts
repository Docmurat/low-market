/**
 * Назначение/снятие роли moderator (доступ только к /moder — панель фото).
 * Пользователь должен сначала сам войти на сайт по телефону (создать аккаунт).
 *
 * Запуск [VSCode терминал]:
 *   npx tsx scripts/make-moderator.ts +79991234567
 *   npx tsx scripts/make-moderator.ts +79991234567 --revoke
 */
import './load-env';
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../src/lib/checkout-shared';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const revoke = args.includes('--revoke');
  const phoneArg = args.find((a) => !a.startsWith('--'));
  if (!phoneArg) {
    console.error('Использование: npx tsx scripts/make-moderator.ts <телефон> [--revoke]');
    process.exit(1);
  }
  const phone = normalizePhone(phoneArg);
  if (!phone) {
    console.error(`Не похоже на телефон: ${phoneArg}`);
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    console.error(
      `Пользователь ${phone} не найден. Пусть сначала войдёт на сайт по этому номеру — аккаунт создастся автоматически.`,
    );
    process.exit(1);
  }

  if (user.role === 'admin') {
    console.error(
      `${phone} — админ, у него доступ и так шире. Снимать админа этим скриптом нельзя (используйте make-admin.ts --revoke).`,
    );
    process.exit(1);
  }

  const role = revoke ? 'customer' : 'moderator';
  if (user.role === role) {
    console.log(`${phone} уже имеет роль ${role} — ничего не меняю.`);
    return;
  }
  await prisma.user.update({ where: { id: user.id }, data: { role } });
  console.log(
    revoke
      ? `Готово: с ${phone} снята роль модератора.`
      : `Готово: ${phone} — модератор. Доступ: /moder (ссылка «Модерация» в шапке).`,
  );
}

main()
  .catch((e) => {
    console.error('ОШИБКА:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
