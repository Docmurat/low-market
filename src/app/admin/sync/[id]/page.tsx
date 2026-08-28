export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';

const dtFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export default async function AdminSyncDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const log = await prisma.syncLog.findUnique({ where: { id } });
  if (!log) notFound();

  const counters: [string, number][] = [
    ['Получено от поставщика', log.fetched],
    ['Создано', log.created],
    ['Обновлено', log.updated],
    ['Пропущено', log.skipped],
    ['Деактивировано', log.deactivated],
    ['Характеристик обработано', log.specsDone],
    ['Запросов к API', log.apiRequests],
    ['Ошибок', log.errors],
  ];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/admin/sync" className="text-xs text-steel charge-link">← к журналу</Link>
        <h2 className="mt-1 text-xl font-bold">
          Прогон #{log.id} · <span className="font-mono">{log.mode}</span>
          {log.args && <span className="font-mono text-steel"> {log.args}</span>}
        </h2>
      </div>

      <section className="rounded-2xl bg-card border border-line p-5">
        <dl className="grid gap-2 text-sm sm:grid-cols-[220px_1fr]">
          <dt className="text-steel">Статус</dt>
          <dd className={`font-semibold ${log.status === 'ok' ? 'text-green-700' : log.status === 'error' ? 'text-red-600' : ''}`}>
            {log.status}
          </dd>
          <dt className="text-steel">Начало</dt>
          <dd>{dtFmt.format(log.startedAt)}</dd>
          <dt className="text-steel">Конец</dt>
          <dd>{log.finishedAt ? dtFmt.format(log.finishedAt) : '—'}</dd>
          {counters.map(([label, value]) => (
            <FragmentRow key={label} label={label} value={value} />
          ))}
        </dl>
        {log.message && (
          <p className={`mt-4 rounded-lg p-3 text-sm ${log.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-50'}`}>
            {log.message}
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-card border border-line p-5">
        <h3 className="mb-3 font-semibold">Хвост консольного вывода</h3>
        {log.log ? (
          <pre className="max-h-[32rem] overflow-auto rounded-lg bg-ink p-4 text-xs leading-relaxed text-gray-200 whitespace-pre-wrap">
            {log.log}
          </pre>
        ) : (
          <p className="text-sm text-steel">Лог не сохранён.</p>
        )}
      </section>
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: number }) {
  return (
    <>
      <dt className="text-steel">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </>
  );
}
