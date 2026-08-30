export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { requireModerator } from '@/lib/staff';

export default async function ModerLayout({ children }: { children: React.ReactNode }) {
  // Проверка на каждый заход в раздел; server actions проверяют доступ отдельно.
  const user = await requireModerator();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Модерация фото</h1>
          <p className="mt-1 text-sm text-steel">
            Загруженные фото автоматически выравниваются и сжимаются.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          {user.role === 'admin' && (
            <Link href="/admin" className="charge-link text-steel">
              ← в админку
            </Link>
          )}
          <span className="max-w-[12rem] truncate text-steel">{user.name || user.phone}</span>
        </div>
      </div>

      <nav className="mb-6 flex gap-6 border-b border-line text-sm font-medium">
        <Link href="/moder/photos" className="charge-link -mb-px border-b-2 border-transparent pb-2 hover:border-volt">
          Без фото
        </Link>
        <Link href="/moder/review" className="charge-link -mb-px border-b-2 border-transparent pb-2 hover:border-volt">
          Разбор фото
        </Link>
      </nav>

      {children}
    </div>
  );
}
