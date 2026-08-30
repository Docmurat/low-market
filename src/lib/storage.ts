/**
 * Yandex Object Storage (S3-совместимый) — хранилище фото, загруженных модераторами.
 * Переменные окружения: S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY. Пустые = хранилище выключено (isStorageConfigured()).
 * Без 'server-only' — модуль могут использовать и скрипты (как telegram.ts).
 * В клиентские компоненты НЕ импортировать.
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

type StorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function getConfig(): StorageConfig {
  return {
    endpoint: (process.env.S3_ENDPOINT || '').replace(/\/+$/, ''),
    region: process.env.S3_REGION || 'ru-central1',
    bucket: process.env.S3_BUCKET || '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  };
}

export function isStorageConfigured(): boolean {
  const c = getConfig();
  return Boolean(c.endpoint && c.bucket && c.accessKeyId && c.secretAccessKey);
}

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    const c = getConfig();
    client = new S3Client({
      endpoint: c.endpoint,
      region: c.region,
      credentials: { accessKeyId: c.accessKeyId, secretAccessKey: c.secretAccessKey },
    });
  }
  return client;
}

/** Публичная ссылка на объект бакета (чтение у бакета публичное). */
export function publicStorageUrl(key: string): string {
  const c = getConfig();
  return `${c.endpoint}/${c.bucket}/${key}`;
}

/** Загружает объект и возвращает его публичную ссылку. */
export async function uploadToStorage(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const c = getConfig();
  await s3().send(
    new PutObjectCommand({ Bucket: c.bucket, Key: key, Body: body, ContentType: contentType }),
  );
  return publicStorageUrl(key);
}

/**
 * Удаляет объект по его публичной ссылке, если ссылка ведёт в НАШ бакет.
 * Чужие ссылки (фото поставщика и т.п.) молча пропускает — удалять там нечего.
 */
export async function deleteFromStorageByUrl(url: string): Promise<void> {
  const c = getConfig();
  const prefix = `${c.endpoint}/${c.bucket}/`;
  if (!c.bucket || !url.startsWith(prefix)) return;
  const key = url.slice(prefix.length);
  if (!key) return;
  await s3().send(new DeleteObjectCommand({ Bucket: c.bucket, Key: key }));
}
