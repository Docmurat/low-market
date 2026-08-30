/**
 * Проверка Yandex Object Storage: генерирует картинку через sharp,
 * загружает в бакет и печатает публичную ссылку.
 * Запуск: npx tsx scripts/test-s3.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// npx tsx сам .env не читает (dotenv в проекте нет) — грузим руками.
function loadEnv() {
  let raw: string;
  try {
    raw = readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  } catch {
    console.error('Файл .env не найден. Запускайте из корня проекта.');
    process.exit(1);
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnv();

  const endpoint = process.env.S3_ENDPOINT || '';
  const region = process.env.S3_REGION || '';
  const bucket = process.env.S3_BUCKET || '';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || '';

  const missing = [
    ['S3_ENDPOINT', endpoint],
    ['S3_REGION', region],
    ['S3_BUCKET', bucket],
    ['S3_ACCESS_KEY_ID', accessKeyId],
    ['S3_SECRET_ACCESS_KEY', secretAccessKey],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    console.error('В .env не заполнены: ' + missing.join(', '));
    console.error('(если имя набирали не руками — проверьте буквы-двойники)');
    process.exit(1);
  }
  if (/[<>]/.test(accessKeyId) || /[<>]/.test(secretAccessKey)) {
    console.error('В ключах остались угловые скобки < > — уберите их, оставьте сам ключ в кавычках.');
    process.exit(1);
  }

  console.log('1/3. Генерирую тестовую картинку (sharp)…');
  const image = await sharp({
    create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 140, b: 0 } },
  })
    .webp({ quality: 80 })
    .toBuffer();
  console.log(`     Готово: ${image.length} байт (webp).`);

  console.log('2/3. Загружаю в бакет…');
  const s3 = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const key = 'test/hello.webp';
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: image,
      ContentType: 'image/webp',
    }),
  );

  const publicUrl = `${endpoint.replace(/\/+$/, '')}/${bucket}/${key}`;
  console.log('3/3. УСПЕХ! Откройте в браузере (должен быть оранжевый квадрат):');
  console.log('     ' + publicUrl);
}

main().catch((e) => {
  console.error('ОШИБКА:', e instanceof Error ? e.message : e);
  process.exit(1);
});