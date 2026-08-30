export const dynamic = 'force-dynamic';

import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { isStorageConfigured } from '@/lib/storage';
import { removePhoto, togglePlaceholder } from '../actions';
import PhotoUploadForm from '@/components/moder/PhotoUploadForm';

export default async function ModerProductPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      supplierSku: true,
      slug: true,
      name: true,
      brand: true,
      images: true,
      isActive: true,
      photoPlaceholder: true,
      category: { select: { supplierPath: true, name: true } },
    },
  });
  if (!product) notFound();

  const storageReady = isStorageConfigured();
  const hasImages = product.images.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/moder/photos" className="text-xs text-steel charge-link">
          ← к списку
        </Link>
        <h2 className="mt-1 text-xl font-bold">
          <span className="font-mono text-steel">{product.supplierSku}</span> · {product.brand}{' '}
          {product.name}
        </h2>
        <p className="mt-1 text-sm text-steel">
          {product.category.supplierPath ?? product.category.name} ·{' '}
          <a
            href={`/product/${product.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="charge-link"
          >
            открыть на сайте ↗
          </a>
        </p>
      </div>

      {/* Статус витрины: есть фото → виден; нет фото → заглушка или скрыт */}
      <section className="rounded-2xl border border-line bg-card p-5">
        {hasImages ? (
          <p className="text-sm">
            <span className="mr-2 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              Виден на витрине
            </span>
            У товара есть фото — показывается в каталоге и поиске.
          </p>
        ) : product.photoPlaceholder ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              <span className="mr-2 inline-block rounded-full bg-volt/30 px-2.5 py-0.5 text-xs font-semibold text-ink">
                Опубликован с заглушкой
              </span>
              На витрине с картинкой «Фото скоро появится».
            </p>
            <form action={togglePlaceholder}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="enable" value="0" />
              <button type="submit" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-steel hover:bg-gray-50 transition-colors">
                Снять заглушку (скрыть с витрины)
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p>
              <span className="mr-2 inline-block rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                Скрыт с витрины
              </span>
              Появится после загрузки фото — или опубликуйте с заглушкой.
            </p>
            <form action={togglePlaceholder}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="enable" value="1" />
              <button type="submit" className="rounded-lg bg-volt px-3 py-1.5 text-xs font-semibold text-ink hover:bg-volt-dark transition-colors">
                Опубликовать с заглушкой
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-5">
        <h3 className="mb-3 font-semibold">
          Текущие фото{' '}
          <span className="text-sm font-normal text-steel">({product.images.length})</span>
        </h3>
        {product.images.length === 0 ? (
          <p className="text-sm text-steel">Фотографий пока нет.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {product.images.map((src, i) => (
              <div key={src} className="w-32">
                <div className="relative h-32 w-32 overflow-hidden rounded-lg border border-line bg-white">
                  <Image src={src} alt={`Фото ${i + 1}`} fill className="object-contain p-1" sizes="128px" />
                </div>
                <form action={removePhoto} className="mt-1 text-center">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="image" value={src} />
                  <button type="submit" className="text-xs text-steel charge-link">
                    Убрать
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-steel">
          Первое фото — главное (показывается в каталоге). «Убрать» пригодится и для битых
          ссылок поставщика.
        </p>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5">
        <h3 className="mb-3 font-semibold">Добавить фото</h3>
        {storageReady ? (
          <PhotoUploadForm productId={product.id} />
        ) : (
          <p className="text-sm text-red-600">
            Хранилище не настроено: заполните S3_* в .env и перезапустите сервер.
          </p>
        )}
      </section>
    </div>
  );
}
