/**
 * Адресные подсказки (задача 8b): POST /api/address-suggest, тело { query: string }.
 * Прокси к DaData «Подсказки по адресам» — ключ живёт ТОЛЬКО на сервере (.env
 * DADATA_API_KEY; пусто = подсказки выключены, форма чекаута работает вручную).
 * Бесплатный тариф DaData: 10 000 запросов/день (каждый введённый символ = запрос,
 * у нас смягчено дебаунсом на клиенте). При исчерпании лимита просто вернём пустой
 * список — покупатель заполнит поля руками, ничего не ломается.
 */
const DADATA_URL = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address';

export type AddressSuggestion = {
  label: string; // полная строка адреса для выпадашки
  region: string; // 'г Москва' | 'Московская обл' | другое — по нему зона доставки
  city: string;
  street: string;
  house: string;
};

export async function POST(req: Request): Promise<Response> {
  const key = (process.env.DADATA_API_KEY ?? '').trim();

  let query = '';
  try {
    const body = (await req.json()) as { query?: unknown };
    query = String(body.query ?? '').slice(0, 300);
  } catch {
    /* пустой query ниже отработает как «нет подсказок» */
  }

  // Пустой ключ или слишком короткий ввод — честно говорим «выключено/пусто».
  if (!key) return json({ enabled: false, suggestions: [] });
  if (query.trim().length < 3) return json({ enabled: true, suggestions: [] });

  try {
    const res = await fetch(DADATA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Token ${key}`,
      },
      body: JSON.stringify({
        query,
        count: 6,
        // Москву и МО поднимаем в топ выдачи, но другие регионы не прячем:
        // покупатель из другого города должен найти свой адрес и увидеть
        // честное «курьером не доставляем», а не пустой список.
        locations_boost: [{ kladr_id: '77' }, { kladr_id: '50' }],
      }),
      signal: AbortSignal.timeout(5_000),
      cache: 'no-store',
    });
    if (!res.ok) return json({ enabled: true, suggestions: [] });

    const data = (await res.json()) as {
      suggestions?: {
        value?: string;
        data?: Record<string, string | null>;
      }[];
    };

    const suggestions: AddressSuggestion[] = (data.suggestions ?? []).map((s) => {
      const d = s.data ?? {};
      const region = d.region_with_type ?? '';
      // У Москвы city пустой (город = регион) — подставляем сами.
      const city =
        d.city_with_type ?? d.settlement_with_type ?? (/москва/i.test(region) ? 'Москва' : '');
      const house = [d.house, d.block_type_full && d.block ? `${d.block_type} ${d.block}` : '']
        .filter(Boolean)
        .join(' ');
      return {
        label: s.value ?? '',
        region,
        city: city ?? '',
        street: d.street_with_type ?? '',
        house,
      };
    });

    return json({ enabled: true, suggestions });
  } catch (e) {
    console.error('[address-suggest] DaData недоступна:', e);
    return json({ enabled: true, suggestions: [] });
  }
}

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
