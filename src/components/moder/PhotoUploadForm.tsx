'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { uploadPhoto, type PhotoUploadState } from '@/app/moder/photos/actions';

// Начальное состояние живёт здесь: из 'use server'-файла константы экспортировать нельзя.
const initialState: PhotoUploadState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-ink hover:bg-volt-dark transition-colors disabled:opacity-50"
    >
      {pending ? 'Обрабатываем…' : 'Загрузить'}
    </button>
  );
}

export default function PhotoUploadForm({ productId }: { productId: number }) {
  const [state, formAction] = useFormState(uploadPhoto, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // После успешной загрузки очищаем форму — можно сразу грузить следующие
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <input type="hidden" name="productId" value={productId} />

      <div>
        <label className="mb-1 block text-sm font-medium">
          Файлы с компьютера — можно несколько сразу (ракурсы)
        </label>
        <input
          type="file"
          name="file"
          accept="image/*"
          multiple
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-volt file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-volt-dark"
        />
        <p className="mt-1 text-xs text-steel">
          Загружаются в выбранном порядке; первое фото товара — главное.
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-steel">
        <span className="h-px flex-1 bg-line" />
        или
        <span className="h-px flex-1 bg-line" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">
          Ссылка: на картинку или на страницу товара
        </label>
        <input
          type="url"
          name="url"
          placeholder="https://www.hihonor.com/ru/phones/…"
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-volt"
        />
        <p className="mt-1 text-xs text-steel">
          Берите с ОФИЦИАЛЬНОГО сайта производителя: можно вставить адрес страницы товара —
          главное фото подтянется само. Маркетплейсы (Яндекс.Маркет, Ozon и т.п.) не
          поддерживаются: там чужие фото и защита от копирования.
        </p>
      </div>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && state.message && <p className="text-sm text-green-700">{state.message}</p>}

      <SubmitButton />
      <p className="text-xs text-steel">
        До 10 МБ на файл. Каждое фото само выровняется (до 1200×1200, белый фон) и сожмётся в webp.
      </p>
    </form>
  );
}
