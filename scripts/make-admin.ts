/**
 * Назначение (или снятие) роли admin по номеру телефона.
 * Аккаунт должен уже существовать — сначала войдите на сайте по этому номеру.
 *
 * Запуск:
 *   npx tsx scripts/make-admin.ts +79991234567           → сделать админом
 *   npx tsx scripts/make-admin.ts +79991234567 --revoke  → вернуть в покупатели
 */
import { readFileSync, existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

// ---------- .env (tsx сам его не читает) ----------
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function normalizePhone(raw: string): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 10) d = '7' + d;
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length !== 11 || !d.startsWith('7')) return null;
  return '+' + d;
}

async function main() {
  const [rawPhone, flag] = process.argv.slice(2);
  const revoke = flag === '--revoke';

  const phone = normalizePhone(rawPhone ?? '');
  if (!phone) {
    console.error('Использование: npx tsx scripts/make-admin.ts +79991234567 [--revoke]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, phone: true, name: true, role: true },
    });
    if (!user) {
      console.error(`Пользователь ${phone} не найден. Сначала войдите на сайте по этому номеру.`);
      process.exit(1);
    }

    const role = revoke ? 'customer' : 'admin';
    if (user.role === role) {
      console.log(`У ${phone} уже роль "${role}" — ничего не меняю.`);
      return;
    }

    await prisma.user.update({ where: { id: user.id }, data: { role } });
    console.log(`Готово: ${phone}${user.name ? ` (${user.name})` : ''} → роль "${role}".`);
    if (!revoke) console.log('Раздел /admin откроется после обновления страницы.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
