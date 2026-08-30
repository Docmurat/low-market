'use server';

/**
 * Server actions панели модерации фото.
 * Каждое действие само проверяет доступ (requireModerator) — layout недостаточно.
 * redirect здесь не используется, поэтому try/catch безопасны.
 *
 * Ссылка в форме может вести и на картинку, и на СТРАНИЦУ товара: если пришёл
 * HTML, вытаскиваем главное фото из мета-тегов og:image / twitter:image
 * (работает на сайтах производителей; маркетплейсы отдают капчу — их не берём).
 * Любая правка фото модератором ставит imagesLocked — синк их больше не трогает.
 */
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { requireModerator } from '@/lib/staff';
import { processProductImage } from '@/lib/image-process';
import { uploadToStorage, deleteFromStorageByUrl, isStorageConfigured } from '@/lib/storage';

/** Лимит одного исходного файла/скачивания, байт (после обработки будет сильно меньше). */
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/** Максимум файлов за одну загрузку. */
const MAX_FILES = 10;
/** Таймаут скачивания по ссылке, мс. */
const FETCH_TIMEOUT_MS = 15_000;

export type PhotoUploadState = { ok: boolean; error?: string; message?: string };

/** Обновить страницы, где видно это фото. */
function revalidateProduct(productId: number, slug: string) {
  revalidatePath('/moder/photos');
  revalidatePath(`/moder/photos/${productId}`);
  revalidatePath(`/product/${slug}`);
}

async function fetchUrl(url: string): Promise<Response> {
  try {
    return await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOW-Market photo tool)' },
    });
  } catch {
    throw new Error('Не удалось скачать по ссылке (сайт не ответил). Сохраните файл и загрузите его.');
  }
}

/** Ищет главное фото страницы в мета-тегах (og:image, twitter:image). */
function extractMetaImage(html: string, pageUrl: string): string | null {
  // Атрибуты могут идти в любом порядке: property→content и content→property
  const patterns = [
    /<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*\scontent=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]*\s(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      try {
        // Относительные ссылки приводим к абсолютным; &amp; в HTML → &
        return new URL(m[1].replace(/&amp;/g, '&'), pageUrl).toString();
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Получает картинку по ссылке. Если ссылка ведёт на HTML-страницу —
 * пробует вытащить её главное фото из мета-тегов (один дополнительный запрос).
 */
async function sourceFromUrl(url: string): Promise<Buffer> {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Ссылка должна начинаться с http:// или https://');
  }
  let res = await fetchUrl(url);
  if (!res.ok) {
    throw new Error(`Сайт вернул ошибку ${res.status}. Сохраните файл и загрузите его вручную.`);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    // Пришла страница, а не картинка — ищем og:image
    const html = (await res.text()).slice(0, 500_000);
    const imageUrl = extractMetaImage(html, res.url || url);
    if (!imageUrl) {
      throw new Error(
        'Это ссылка на страницу, и главное фото на ней найти не удалось. Откройте картинку в новой вкладке и скопируйте её адрес — или сохраните файл и загрузите его. Маркетплейсы (Яндекс.Маркет и т.п.) не поддерживаются — берите фото с сайта производителя.',
      );
    }
    res = await fetchUrl(imageUrl);
    if (!res.ok) {
      throw new Error(`Нашёл фото на странице, но скачать его не вышло (ошибка ${res.status}). Сохраните файл и загрузите вручную.`);
    }
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new Error('По ссылке пришёл пустой ответ.');
  if (buf.length > MAX_SOURCE_BYTES) {
    throw new Error('Файл по ссылке больше 10 МБ — уменьшите его перед загрузкой.');
  }
  return buf;
}

/** Загрузка фото: файлами (можно несколько) ИЛИ по ссылке (картинка/страница). */
export async function uploadPhoto(
  _prev: PhotoUploadState,
  formData: FormData,
): Promise<PhotoUploadState> {
  await requireModerator();

  if (!isStorageConfigured()) {
    return { ok: false, error: 'Хранилище не настроено (S3_* в .env).' };
  }

  const productId = Number(formData.get('productId'));
  if (!Number.isInteger(productId) || productId <= 0) {
    return { ok: false, error: 'Товар не определён — обновите страницу.' };
  }
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, supplierSku: true, slug: true },
  });
  if (!product) return { ok: false, error: 'Товар не найден — обновите страницу.' };

  // Источники: файлы приоритетнее ссылки
  const files = formData
    .getAll('file')
    .filter((f): f is File => f instanceof File && f.size > 0);
  const url = String(formData.get('url') ?? '').trim();

  const sources: Buffer[] = [];
  try {
    if (files.length > 0) {
      if (files.length > MAX_FILES) {
        return { ok: false, error: `За раз можно не больше ${MAX_FILES} файлов.` };
      }
      for (const f of files) {
        if (f.size > MAX_SOURCE_BYTES) {
          return { ok: false, error: `Файл «${f.name}» больше 10 МБ — уменьшите его.` };
        }
        sources.push(Buffer.from(await f.arrayBuffer()));
      }
    } else if (url) {
      sources.push(await sourceFromUrl(url));
    } else {
      return { ok: false, error: 'Выберите файл(ы) или вставьте ссылку.' };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Не удалось получить файл.' };
  }

  // Обработка и загрузка по очереди; при сбое честно говорим, сколько успело
  const uploaded: string[] = [];
  let totalBytes = 0;
  for (let i = 0; i < sources.length; i++) {
    let processed: Buffer;
    try {
      processed = await processProductImage(sources[i]);
    } catch {
      return {
        ok: false,
        error:
          `Файл №${i + 1} не похож на картинку` +
          (uploaded.length ? ` (до него добавлено: ${uploaded.length})` : '') +
          '. Если брали ссылку со страницы — нужна прямая ссылка на изображение.',
      };
    }
    try {
      const key = `products/${product.supplierSku}/${Date.now()}-${i}.webp`;
      uploaded.push(await uploadToStorage(key, processed, 'image/webp'));
      totalBytes += processed.length;
    } catch (e) {
      return {
        ok: false,
        error:
          'Не удалось сохранить в хранилище: ' +
          (e instanceof Error ? e.message : 'ошибка') +
          (uploaded.length ? ` (успело добавиться: ${uploaded.length})` : ''),
      };
    }
    // Успевшие — сразу в товар, чтобы сбой на середине ничего не терял.
    // Появилось фото → заглушка больше не нужна, снимаем.
    await prisma.product.update({
      where: { id: product.id },
      data: {
        images: { push: uploaded[uploaded.length - 1] },
        imagesLocked: true,
        photoPlaceholder: false,
      },
    });
  }

  revalidateProduct(product.id, product.slug);
  const kb = Math.round(totalBytes / 1024);
  return {
    ok: true,
    message:
      uploaded.length === 1
        ? `Фото добавлено (${kb} КБ после сжатия).`
        : `Добавлено фото: ${uploaded.length} (суммарно ${kb} КБ после сжатия).`,
  };
}

/**
 * Опубликовать товар БЕЗ фото с заглушкой (enable=1) или снять заглушку (enable=0).
 * Имеет смысл только для товаров без фото: с фото товар и так виден.
 */
export async function togglePlaceholder(formData: FormData): Promise<void> {
  await requireModerator();

  const productId = Number(formData.get('productId'));
  const enable = String(formData.get('enable')) === '1';
  if (!Number.isInteger(productId) || productId <= 0) return;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, images: true },
  });
  if (!product) return;
  if (enable && product.images.length > 0) return; // уже виден благодаря фото

  await prisma.product.update({
    where: { id: product.id },
    data: { photoPlaceholder: enable },
  });

  revalidateProduct(product.id, product.slug);
}

/** Убрать фото из товара (и удалить файл из нашего бакета, если он наш). */
export async function removePhoto(formData: FormData): Promise<void> {
  await requireModerator();

  const productId = Number(formData.get('productId'));
  const image = String(formData.get('image') ?? '');
  if (!Number.isInteger(productId) || productId <= 0 || !image) return;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, images: true },
  });
  if (!product || !product.images.includes(image)) return;

  await prisma.product.update({
    where: { id: product.id },
    data: {
      images: { set: product.images.filter((i) => i !== image) },
      imagesLocked: true, // решение модератора — синк это фото не вернёт
    },
  });

  // Файл в бакете чистим по возможности; чужие ссылки функция пропустит сама
  try {
    await deleteFromStorageByUrl(image);
  } catch {
    // не критично: ссылка из товара уже убрана, объект можно удалить позже руками
  }

  revalidateProduct(product.id, product.slug);
}
