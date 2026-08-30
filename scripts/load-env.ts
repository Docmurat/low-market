/**
 * Чтение .env для скриптов, запускаемых через `npx tsx` (он .env сам не подхватывает,
 * а пакета dotenv в проекте нет — Next читает .env самостоятельно).
 * Использование — ПЕРВЫМ импортом скрипта:  import './load-env';
 * Уже установленные переменные окружения не перезаписывает.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

function loadEnv(): void {
  let raw: string;
  try {
    raw = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  } catch {
    console.error('Файл .env не найден. Запускайте скрипт из корня проекта.');
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

loadEnv();
