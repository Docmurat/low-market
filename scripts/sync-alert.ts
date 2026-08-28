/**
 * Алерт по последнему прогону синхронизации.
 * Смотрит свежую запись SyncLog и шлёт сообщение в Telegram, если:
 *   - статус error, ИЛИ
 *   - есть ошибки по категориям/пачкам (errors > 0), ИЛИ
 *   - прогон висит в running дольше 3 часов (вероятно, упал без записи).
 * Ничего не менять в sync-supplier.ts не нужно — запускать ПОСЛЕ синка:
 *   npx tsx scripts/sync-supplier.ts prices; npx tsx scripts/sync-alert.ts
 * (на сервере в cron соединим их на шаге 12).
 *
 * Проверка настройки Telegram: npx tsx scripts/sync-alert.ts --test
 */
import { readFileSync, existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { sendTelegram, isTelegramConfigured } from '../src/lib/telegram';

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

const STUCK_HOURS = 3;

async function main() {
  const test = process.argv.includes('--test');

  if (test) {
    console.log('[alert] тестовое сообщение…');
    const ok = await sendTelegram('✅ LOW-Market: Telegram-алерты настроены и работают.');
    console.log(ok ? '[alert] отправлено — проверьте чат.' : '[alert] НЕ отправлено (см. вывод выше).');
    return;
  }

  if (!isTelegramConfigured()) {
    console.log('[alert] Telegram не настроен — проверять нечего. Заполните TELEGRAM_* в .env.');
    return;
  }

  const prisma = new PrismaClient();
  try {
    const last = await prisma.syncLog.findFirst({ orderBy: { startedAt: 'desc' } });
    if (!last) {
      console.log('[alert] записей SyncLog нет.');
      return;
    }

    const started = last.startedAt.toLocaleString('ru-RU');
    const stuck =
      last.status === 'running' &&
      Date.now() - last.startedAt.getTime() > STUCK_HOURS * 60 * 60 * 1000;

    let problem: string | null = null;
    if (last.status === 'error') {
      problem = `❌ Синк LOW-Market УПАЛ (режим ${last.mode}, старт ${started}).\n${last.message || 'без сообщения'}`;
    } else if (stuck) {
      problem = `⏳ Синк LOW-Market висит в running дольше ${STUCK_HOURS} ч (режим ${last.mode}, старт ${started}). Вероятно, прерван.`;
    } else if (last.errors > 0) {
      problem = `⚠️ Синк LOW-Market завершился с ошибками: ${last.errors} шт. (режим ${last.mode}, старт ${started}, обновлено ${last.updated}).${last.message ? `\n${last.message}` : ''}`;
    }

    if (!problem) {
      console.log(`[alert] последний прогон в порядке (${last.mode}, ${last.status}, ошибок 0) — молчу.`);
      return;
    }

    const ok = await sendTelegram(`${problem}\nПодробности: /admin/sync/${last.id}`);
    console.log(ok ? '[alert] алерт отправлен.' : '[alert] отправка не удалась.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
