import { SITE_NAME } from '@/lib/site';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-gray-400 mt-16">
      <div className="mx-auto max-w-7xl px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
        <div>
          <div className="font-display text-lg text-white mb-3">
            LOW<span className="text-volt">-</span>Market
          </div>
          <p>
            Компьютерная и бытовая техника по ценам субдистрибьютора. Вся продукция —
            Ростест, с официальной гарантией на территории РФ.
          </p>
        </div>
        <div>
          <div className="text-white font-semibold mb-3">Покупателям</div>
          <ul className="space-y-2">
            <li>Доставка и оплата</li>
            <li>Возврат и гарантия</li>
            <li>Оптовым покупателям</li>
          </ul>
        </div>
        <div>
          <div className="text-white font-semibold mb-3">Контакты</div>
          <ul className="space-y-2">
            <li>Москва и Московская область</li>
            <li>Пн–Пт, 9:00–19:00</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-gray-800 py-4 text-center text-xs">
        © {year} {SITE_NAME} · ИП · Реквизиты и публичная оферта появятся здесь перед запуском
      </div>
    </footer>
  );
}
