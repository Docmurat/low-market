/**
 * Чекаут: типы, валидация, нормализация. Без серверных импортов —
 * используется и в клиентской форме, и в server actions.
 */
export const CHECKOUT_COOKIE = 'lm_checkout';

export type DeliveryMethod = 'courier' | 'pickup';

export const DELIVERY_OPTIONS: { value: DeliveryMethod; label: string; hint: string }[] = [
  { value: 'courier', label: 'Курьером по Москве и МО', hint: '1–2 рабочих дня, стоимость рассчитаем при подтверждении' },
  { value: 'pickup', label: 'Самовывоз', hint: 'Из пункта выдачи в Москве, адрес сообщим при подтверждении' },
];

export type CheckoutData = {
  customerName: string;
  phone: string; // нормализован +7XXXXXXXXXX
  email: string;
  deliveryMethod: DeliveryMethod;
  city: string;
  street: string;
  house: string;
  apartment: string;
  entrance: string;
  floor: string;
  intercom: string;
  comment: string;
};

export type CheckoutErrors = Partial<Record<keyof CheckoutData, string>>;

export const EMPTY_CHECKOUT: CheckoutData = {
  customerName: '',
  phone: '',
  email: '',
  deliveryMethod: 'courier',
  city: 'Москва',
  street: '',
  house: '',
  apartment: '',
  entrance: '',
  floor: '',
  intercom: '',
  comment: '',
};

/** "+7 (999) 123-45-67", "89991234567", "9991234567" → "+79991234567"; иначе null */
export function normalizePhone(raw: string): string | null {
  let d = (raw ?? '').replace(/\D/g, '');
  if (d.length === 10) d = '7' + d;
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length !== 11 || !d.startsWith('7')) return null;
  return '+' + d;
}

export function formatPhone(p: string): string {
  const d = p.replace(/\D/g, '');
  if (d.length !== 11) return p;
  return `+7 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}`;
}

const s = (v: FormDataEntryValue | null | undefined, max = 200) => String(v ?? '').trim().slice(0, max);

/** Разбор FormData шага 1 + валидация. */
export function parseCheckout(fd: FormData): { data: CheckoutData; errors: CheckoutErrors } {
  const method = s(fd.get('deliveryMethod')) === 'pickup' ? 'pickup' : 'courier';
  const data: CheckoutData = {
    customerName: s(fd.get('customerName'), 100),
    phone: s(fd.get('phone'), 30),
    email: s(fd.get('email'), 100).toLowerCase(),
    deliveryMethod: method,
    city: s(fd.get('city'), 100),
    street: s(fd.get('street'), 150),
    house: s(fd.get('house'), 20),
    apartment: s(fd.get('apartment'), 20),
    entrance: s(fd.get('entrance'), 10),
    floor: s(fd.get('floor'), 10),
    intercom: s(fd.get('intercom'), 20),
    comment: s(fd.get('comment'), 1000),
  };

  const errors: CheckoutErrors = {};
  if (data.customerName.length < 2) errors.customerName = 'Укажите имя';
  const phone = normalizePhone(data.phone);
  if (!phone) errors.phone = 'Укажите телефон в формате +7 999 123-45-67';
  else data.phone = phone;
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Проверьте email';
  if (method === 'courier') {
    if (!data.city) errors.city = 'Укажите город';
    if (!data.street) errors.street = 'Укажите улицу';
    if (!data.house) errors.house = 'Укажите дом';
  }
  return { data, errors };
}

export function formatAddress(d: Pick<CheckoutData, 'city' | 'street' | 'house' | 'apartment' | 'entrance' | 'floor' | 'intercom'>): string {
  const parts = [d.city, d.street, d.house ? `д. ${d.house}` : ''];
  if (d.apartment) parts.push(`кв. ${d.apartment}`);
  if (d.entrance) parts.push(`подъезд ${d.entrance}`);
  if (d.floor) parts.push(`этаж ${d.floor}`);
  if (d.intercom) parts.push(`домофон ${d.intercom}`);
  return parts.filter(Boolean).join(', ');
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  new: 'Новый — ожидает подтверждения менеджером',
  confirmed: 'Подтверждён',
  paid: 'Оплачен',
  shipped: 'Передан в доставку',
  done: 'Выполнен',
  cancelled: 'Отменён',
};
