export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { prisma } from '@/lib/db';

const dtFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function statusCell(status: string) {
  if (status === 'ok') return <span className="font-semibold text-green-700">ok</span>;
  if (status === 'error') return <span className="font-semibold text-red-600">error</span>;
  return <span className="font-semibold">{status}</span>;
}

function duration(startedAt: Date, finishedAt: Date | null): string {
  if (!finishedAt) return '—';
  const sec = Math.round((finishedAt.getTime() - startedAt.getTime()) / 1000);
  if (sec < 90) return `${sec} с`;
  return `${Math.round(sec / 60)} мин`;
}

export default async function AdminSyncPage() {
  const logs = await prisma.syncLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
  });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-card border border-line p-5 text-sm text-steel">
        Журнал прогонов scripts/sync-supplier.ts (последние 50). Алерты в Telegram:
        заполните TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID в .env и запускайте
        <span className="font-mono text-ink"> npx tsx scripts/sync-alert.ts</span> после синка
        (проверка настройки: <span className="font-mono text-ink">--test</span>).
      </div>

      {logs.length === 0 ? (
        <p className="rounded-2xl bg-card border border-line p-6 text-sm text-steel">
          Прогонов ещё не было.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-card border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-steel">
                <th className="px-4 py-3 font-medium">Старт</th>
                <th className="px-4 py-3 font-medium">Режим</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium text-right">Длит.</th>
                <th className="px-4 py-3 font-medium text-right">Получено</th>
                <th className="px-4 py-3 font-medium text-right">Обновлено</th>
                <th className="px-4 py-3 font-medium text-right">Деактив.</th>
                <th className="px-4 py-3 font-medium text-right">Ошибок</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {logs.map((l) => (
                <tr key={l.id} className={l.status === 'error' ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3 whitespace-nowrap">{dtFmt.format(l.startedAt)}</td>
                  <td className="px-4 py-3 font-mono">{l.mode}{l.args ? ` ${l.args}` : ''}</td>
                  <td className="px-4 py-3">{statusCell(l.status)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{duration(l.startedAt, l.finishedAt)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.fetched}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.updated}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.deactivated}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${l.errors > 0 ? 'font-semibold text-red-600' : ''}`}>
                    {l.errors}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/sync/${l.id}`} className="text-xs charge-link">лог →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
