'use client';
/**
 * Панель «Заказ у поставщика» в карточке заказа админки (шаг 6c).
 * Заказы АБСОЛЮТ ТРЕЙД оформляются ВРУЧНУЮ в их кабинете; панель помогает:
 *  - список позиций с артикулами поставщика + кнопка «Скопировать список»;
 *  - «Проверить у поставщика» — живые остатки/закупка (server action, только чтение);
 *  - поле для номера ручного заказа из кабинета поставщика.
 * Пока номер не сохранён (и заказ не отменён/не завершён) — горит напоминание.
 */
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import {
  checkSupplierAvailability,
  saveSupplierOrderNumber,
  type SupplierCheckRow,
  type SupplierCheckState,
} from '@/app/admin/orders/supplier-actions';

export type SupplierPanelItem = {
  sku: string;
  brand: string;
  name: string;
  qty: number;
  basePrice: number; // закупка на момент заказа (снимок из OrderItem)
};

// Начальное состояние формы проверки живёт здесь: из файла с 'use server'
// константы экспортировать нельзя (наши грабли из PROJECT_STATE).
const CHECK_INITIAL: SupplierCheckState = { status: 'idle', checkedAt: null, rows: [], message: null };

const fmtRub = (n: number) =>
  n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';

function CheckButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-steel hover:bg-gray-200 transition-colors disabled:opacity-50"
    >
      {pending ? 'Опрашиваю поставщика…' : 'Проверить у поставщика'}
    </button>
  );
}

export default function SupplierOrderPanel({
  orderId,
  orderNumber,
  status,
  items,
  supplierOrderNumber,
  supplierOrderedAtText,
}: {
  orderId: number;
  orderNumber: string;
  status: string;
  items: SupplierPanelItem[];
  supplierOrderNumber: string;
  supplierOrderedAtText: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [checkState, checkAction] = useFormState<SupplierCheckState, FormData>(
    checkSupplierAvailability,
    CHECK_INITIAL,
  );

  const checkBySku = new Map<string, SupplierCheckRow>(checkState.rows.map((r) => [r.sku, r]));
  const needReminder = !supplierOrderNumber && status !== 'cancelled' && status !== 'done';

  async function copyList() {
    const lines = [
      `Заказ ${orderNumber} — позиции для заказа у поставщика (АБСОЛЮТ ТРЕЙД):`,
      ...items.map(
        (it) =>
          `${it.sku}\t${it.qty} шт\t${[it.brand, it.name].filter(Boolean).join(' ')}\t(закупка на момент заказа: ${fmtRub(it.basePrice)})`,
      ),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер недоступен (http без localhost и т.п.) — молча не падаем.
      window.prompt('Скопируйте список вручную:', lines.join('\n'));
    }
  }

  return (
    <section className="rounded-2xl bg-card border border-line p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Заказ у поставщика (вручную)</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyList}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-steel hover:bg-gray-200 transition-colors"
          >
            {copied ? 'Скопировано ✓' : 'Скопировать список'}
          </button>
          <form action={checkAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <CheckButton />
          </form>
        </div>
      </div>

      {needReminder && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          Заказ у поставщика ещё не оформлен. Соберите список (кнопка выше), оформите заказ
          в кабинете АБСОЛЮТ ТРЕЙД и впишите его номер ниже.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-steel">
              <th className="py-2 pr-4 font-medium">Артикул</th>
              <th className="py-2 pr-4 font-medium">Товар</th>
              <th className="py-2 pr-4 font-medium text-right">Кол-во</th>
              <th className="py-2 pr-4 font-medium text-right">Закупка в заказе</th>
              <th className="py-2 pr-4 font-medium text-right">Остаток сейчас</th>
              <th className="py-2 font-medium text-right">Закупка сейчас</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((it) => {
              const c = checkBySku.get(it.sku);
              const short = c && c.found && c.stockQty < it.qty;
              return (
                <tr key={it.sku}>
                  <td className="py-2 pr-4 font-mono text-xs">{it.sku}</td>
                  <td className="py-2 pr-4">
                    <span className="line-clamp-2">{[it.brand, it.name].filter(Boolean).join(' ')}</span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{it.qty}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-steel">{fmtRub(it.basePrice)}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums ${short || (c && !c.found) ? 'text-red-600 font-semibold' : ''}`}>
                    {!c
                      ? '—'
                      : !c.found
                        ? 'нет в фиде'
                        : (c.stockLabel ?? String(c.stockQty)) + (short ? ' (мало!)' : '')}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {!c || !c.found || c.newBase == null ? (
                      '—'
                    ) : (
                      <>
                        {fmtRub(c.newBase)}
                        {c.baseDiff != null && Math.abs(c.baseDiff) >= 0.01 && (
                          <span className={`ml-1 text-xs ${c.baseDiff > 0 ? 'text-red-600' : 'text-green-700'}`}>
                            ({c.baseDiff > 0 ? '+' : ''}{fmtRub(c.baseDiff)})
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {checkState.status === 'ok' && (
        <p className="text-xs text-steel">
          Проверено в {checkState.checkedAt}. Данные живые, ничего у поставщика не заказано —
          это только просмотр.
        </p>
      )}
      {checkState.status === 'error' && checkState.message && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {checkState.message}
        </p>
      )}

      <form action={saveSupplierOrderNumber} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
        <input type="hidden" name="orderId" value={orderId} />
        <label className="flex-1 min-w-[220px]">
          <span className="mb-1 block text-xs text-steel">
            Номер заказа в кабинете поставщика
            {supplierOrderedAtText && (
              <span className="ml-1">(оформлен: {supplierOrderedAtText})</span>
            )}
          </span>
          <input
            type="text"
            name="supplierOrderNumber"
            defaultValue={supplierOrderNumber}
            placeholder="например, 3465118"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-volt px-4 py-2 text-sm font-semibold text-ink hover:bg-volt-dark transition-colors"
        >
          Сохранить
        </button>
      </form>
    </section>
  );
}
