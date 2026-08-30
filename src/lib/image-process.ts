/**
 * Приведение фото товара к единому виду: не больше 1200×1200, белый фон,
 * webp с разумным сжатием. Используется панелью модерации и зеркалированием.
 * Серверный модуль (sharp) — в клиентские компоненты не импортировать.
 */
import sharp from 'sharp';

/** Максимальная сторона изображения, px. */
export const PRODUCT_IMAGE_SIZE = 1200;
/** Качество webp (80–85 — не отличить на глаз, вес в разы меньше jpeg). */
const WEBP_QUALITY = 82;

/**
 * Обрабатывает исходный файл (jpeg/png/webp/gif и т.п.):
 * поворот по EXIF → прозрачность на белый → вписать в 1200×1200 (товар не
 * обрезается; МЕЛКИЕ исходники не растягиваем — растянутое = мыло) → webp.
 * Бросает исключение, если входные данные — не картинка.
 */
export async function processProductImage(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate() // фото с телефона часто «лежат на боку» — EXIF-ориентация
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize(PRODUCT_IMAGE_SIZE, PRODUCT_IMAGE_SIZE, {
      fit: 'inside',
      background: { r: 255, g: 255, b: 255 },
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();
}
