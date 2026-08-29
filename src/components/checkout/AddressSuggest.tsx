'use client';
/**
 * Поле «адрес одной строкой» с подсказками DaData (задача 8b).
 * Дебаунс 300 мс, минимум 3 символа. Ходит в НАШ /api/address-suggest (ключ на
 * сервере). Если подсказки выключены (пустой DADATA_API_KEY) — компонент скрывает
 * себя сам, форма остаётся полностью ручной. Выбор подсказки отдаёт наверх
 * разобранный адрес (регион/город/улица/дом) через onPick.
 */
import { useEffect, useRef, useState } from 'react';
import type { AddressSuggestion } from '@/app/api/address-suggest/route';

export default function AddressSuggest({ onPick }: { onPick: (s: AddressSuggestion) => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null = ещё выясняем
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Один пробный запрос при монтировании: узнаём, включены ли подсказки вообще.
  useEffect(() => {
    fetch('/api/address-suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '' }),
    })
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setEnabled(Boolean(d.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  function onInput(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/address-suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: value }),
        });
        const data = (await res.json()) as { suggestions?: AddressSuggestion[] };
        setItems(data.suggestions ?? []);
        setOpen((data.suggestions ?? []).length > 0);
      } catch {
        setItems([]);
        setOpen(false);
      }
    }, 300);
  }

  function pick(s: AddressSuggestion) {
    setQuery(s.label);
    setOpen(false);
    onPick(s);
  }

  if (enabled === false || enabled === null) return null; // выключено или ещё выясняем

  return (
    <div className="relative">
      <label className="block">
        <span className="text-sm text-steel">Адрес — начните вводить, мы подскажем</span>
        <input
          type="text"
          value={query}
          onChange={(ev) => onInput(ev.target.value)}
          onFocus={() => items.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} // даём клику по подсказке успеть
          placeholder="Москва, Тверская 7"
          autoComplete="off"
          className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 outline-none focus:ring-2 focus:ring-volt"
        />
      </label>
      {open && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-line bg-white shadow-lg">
          {items.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(ev) => ev.preventDefault()} // чтобы blur не закрыл список раньше клика
                onClick={() => pick(s)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-volt/10"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-steel">
        Не нашли адрес в подсказках — заполните поля ниже вручную.
      </p>
    </div>
  );
}
