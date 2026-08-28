# PROJECT_STATE — LOW-Market
Обновлено: 2026-08-28 (вехи: Шаг 4 — User/сессии, вход по SMS и email, ЛК/профиль)
Файл живёт в репозитории: docs/PROJECT_STATE.md. Обновляется на каждой вехе.

## 1. Что за проект
Интернет-магазин техники LOW-Market (экс-«ВОЛЬТ»). Розница Москва/МО, компьютерная
техника — ядро ассортимента. Субдистрибьютор, кроссдокинг со склада поставщика
АБСОЛЮТ ТРЕЙД (группа ELKO), ~10 400 SKU через их API. ИП УСН.
Разработка: владелец + Claude, Windows/VSCode/GitHub/Yandex Cloud.

## 2. Дорожная карта и статус
| Шаг | Содержание | Статус |
|-----|-----------|--------|
| 1 | Каркас Next.js, БД, каталог, карточка, пайплайн синка | ✅ |
| 1.5 | Ребрендинг ВОЛЬТ → LOW-Market | ✅ |
| 6a | Доступ к API поставщика: прокси на сервере, токен, клиент, проба | ✅ |
| 6b | Реальный синк: дерево категорий → Category, 10 384 товара, цены/остатки, характеристики, фото; журнал SyncLog | ✅ |
| 2 | Фильтры по характеристикам, поиск, пагинация, сортировка, карточка товара (галерея, РРЦ, описание) | ✅ |
| 3 | Корзина (Cart/CartItem) + чекаут в 2 шага + Order/OrderItem + кросс-продажи | ✅ |
| 4 | Авторизация (телефон/email), ЛК: мои заказы, профиль, userId в Cart и Order, слияние корзин | ✅ |
| 5 | Админка: заказы и статусы, отзывы, экран SyncLog + алерты в Telegram, переопределение категории товара | ⬜ СЛЕДУЮЩИЙ |
| 6c | Создание заказа у поставщика (Shipment/CreateOrder), статусы отгрузок | ⬜ после 5 |
| 6d | Расписание синка на сервере (cron: prices каждые 2 ч, full ночью) | ⬜ на шаге 12 |
| 7 | ЮKassa: карты, СБП, чеки 54-ФЗ | ⬜ |
| 8 | Доставка: зоны Москва/МО, тарифы (поля адреса в Order уже структурные) | ⬜ |
| 9 | Отзывы + бонус за отзыв | ⬜ |
| 10 | B2B: оптовый заказ, счёт | ⬜ |
| 11 | PWA | ⬜ |
| 12 | Деплой: systemd, nginx для сайта, CI/CD, бэкапы БД, ужесточить SG, сменить SUPPLIER_PROXY_KEY, cron синка | ⬜ |
| Ц | ЦЕНООБРАЗОВАНИЕ (отложено): матрица по категориям, потолок РРЦ, НДС — см. п.5 | ⬜ отдельная задача |

## 3. Инфраструктура (актуально)
- GitHub: private-репозиторий https://github.com/Docmurat/low-market. Коммиты через
  Source Control в VSCode. .env в git не попадает.
- ЛОКАЛЬНО: Windows. Node v24, npm 11. Проект в C:\dev\voltshop.
  PostgreSQL 17 порт 5433 (!), база voltshop. На 5432 — чужой PostgreSQL 14, не трогать.
  Prisma 5.22 (баннер про 8.0 — игнорировать, не обновлять). Docker НЕ используется.
- СЕРВЕР: Yandex Cloud, ВМ voltshop-prod (Ubuntu 24.04, 2 vCPU/4ГБ), IP 89.169.138.130.
  SSH: login ubuntu, ключ %USERPROFILE%\.ssh\voltshop, порты 22 и 443.
  Установлено: Node 20, PostgreSQL 16, git, nginx. БД на сервере не создана (шаг 12).
  Группа безопасности Any/Any (ужесточить на шаге 12).
  VPN у пользователя нужен для Claude; для SSH/scp и для скриптов синка — ВЫКЛЮЧАТЬ.
- ПРОКСИ К ПОСТАВЩИКУ (на сервере): nginx :8443, самоподписанный сертификат
  (копия в репо ops/nginx/supplier.crt), заголовок X-Proxy-Key = SUPPLIER_PROXY_KEY.
  Перед скриптами на ПК: $env:NODE_EXTRA_CA_CERTS="C:\dev\voltshop\ops\nginx\supplier.crt"
- ПОСТАВЩИК — АБСОЛЮТ ТРЕЙД, eCommerce API v3. Токен в .env (SUPPLIER_API_TOKEN, 1 год).
  НЕ вызывать CreateToken. Поддержка: api@absoluttrade.ru. Пауза между запросами 3,2 с.
  Факты по данным (проверено на реальном фиде):
  - CategoryTree: 395 узлов (без мусорных веток), 294 активных; коды категорий НЕ уникальны
    (CBL, NIC, MAS, SPE, CAU…) → категории зеркалим по id узла, товар кладём по строке catalogTree.
  - У части узлов code=null (Умные колонки, Кабели питания…) — их товары через API не достать.
  - ProductSearch по категории отдаёт всё одним ответом (пагинации нет); реально ~4% меньше,
    чем totalProducts в дереве.
  - inStock.quantity — строка: "0", "7", "> 10", "> 40", "> 100" → stock (число) + stockLabel.
  - eanCodes "-" = пусто. rrp может быть 0/пусто. У Lenovo и др. productPrice == rrp.
  - Description: 49 характеристик у ноутбука; ключ "Description" = HTML-текст описания
    (переносим в product.description), "Image" — дубль фото. У ~11% товаров specs пусты.
  - MediaItems: ThumbPicture + Picture; ссылки на selstorage.ru часто 404, относительные
    пути /upload/… → домен https://ecom.absoluttrade.ru (src/lib/supplier/media.ts).
  - Покрытие характеристиками неровное: видеокарты/процессоры 85–95%, ноутбуки ~33%.
  - Пустые/почти пустые категории: Наушники (0 в наличии), Чехлы для смартфонов (1).
  Открытые вопросы к поставщику: лимиты частоты; цены с НДС или без; почему часть фото
  на selstorage битые; категории с code=null.

## 4. Код (ключевые файлы)
### Каталог и синк
- prisma/schema.prisma — Category, Product (+ поля фида), ProductAttribute, SyncLog,
  Cart, CartItem, Order, OrderItem, User, Session, LoginCode.
  Миграции: …_supplier_sync, …_cart, …_orders, …_users.
- scripts/sync-supplier.ts — синк: режимы full | prices | specs; --category=CODE, --limit=N,
  --no-specs, --refresh-specs. Полный: ~18 мин товары + ~1 ч характеристики. Идемпотентен.
  В конце full/specs вызывает buildAttributes. Пишет SyncLog.
- scripts/build-attributes.ts — specs → ProductAttribute по конфигу фильтров + перенос
  Description поставщика в product.description (если пусто).
- scripts/reprice.ts — пересчёт цен по базе без API. scripts/fix-images.ts — починка фото.
- scripts/db-stats.ts, scripts/spec-stats.ts <slug>, scripts/probe-supplier.ts.
- src/lib/pricing.ts — FLAT_MARKUP_PCT из .env (сейчас 10) побеждает всё; матрица и floor
  остаются в коде для будущего; НДС-переключатель не активен.
- src/lib/supplier/{absolut.ts, category-rules.ts, media.ts}.
- src/lib/filters/{config.ts, normalize.ts}; src/lib/catalog/query.ts (фильтры, фасеты,
  сортировка, пагинация 48, поиск).
- src/app/catalog/[slug]/page.tsx, src/app/search/page.tsx, src/app/product/[slug]/page.tsx;
  src/components/catalog/{FilterSidebar, SortBar, Pagination, ProductGrid}; ProductCard
  (принимает id + gism → показывает кнопку «В корзину»); src/components/product/Gallery.tsx.
### Корзина и заказы (Шаг 3)
- src/lib/cart-shared.ts — константы/типы/проверки БЕЗ серверных импортов (можно в клиенте):
  CART_COOKIE=lm_cart (90 дней), MAX_QTY=99, checkPurchasable, clampQty, cartTotals.
- src/lib/cart.ts — серверное чтение: getCart(), getCartCount() (для шапки). Импортирует
  next/headers — В КЛИЕНТСКИЕ КОМПОНЕНТЫ НЕ ИМПОРТИРОВАТЬ.
- src/app/cart/actions.ts — server actions: addToCart, setItemQty, removeItem, clearCart.
  Все проверки на сервере; после изменений revalidatePath('/', 'layout').
- src/app/cart/page.tsx; src/components/cart/{AddToCartButton, CartItemRow} (client).
- src/lib/checkout-shared.ts — типы CheckoutData, parseCheckout (валидация), normalizePhone
  (→ +7XXXXXXXXXX), formatPhone, formatAddress, DELIVERY_OPTIONS (courier | pickup),
  ORDER_STATUS_LABEL.
- src/app/checkout/actions.ts — saveCheckout (шаг 1 → cookie lm_checkout, сутки),
  placeOrder (транзакция: Order + OrderItem-снимки, номер LM-000001 из id, userId
  авторизованного покупателя, очистка позиций корзины, redirect на /order/<accessToken>).
- src/app/checkout/page.tsx (шаг 1; предзаполняется из профиля, черновик из cookie
  приоритетнее), src/app/checkout/confirm/page.tsx (шаг 2),
  src/app/order/[token]/page.tsx (страница заказа по секретной ссылке, не по номеру).
- src/components/checkout/{CheckoutForm (useFormState), PlaceOrderButton}.
### Авторизация и ЛК (Шаг 4)
- src/lib/auth-shared.ts — константы/проверки БЕЗ серверных импортов: SESSION_COOKIE=lm_session
  (30 дней), CODE_LENGTH=6, CODE_TTL_MIN=5, CODE_MAX_ATTEMPTS=5, CODE_RESEND_SEC=60,
  PASSWORD_MIN_LENGTH=8, isValidEmail, passwordProblem, isValidCodeFormat, тип UserView.
- src/lib/auth.ts — серверное ядро (next/headers — в клиент НЕ импортировать):
  getSessionUser(), createSession(), destroySession(), hashPassword/verifyPassword
  (node:crypto scrypt, формат "scrypt:соль:хеш"), generateLoginCode (randomInt).
- src/lib/sms/index.ts — sendLoginCode; SMS_PROVIDER в .env пуст = локальный режим,
  код печатается в терминал dev-сервера. Провайдер НЕ выбран (задача на потом).
- src/lib/cart-merge.ts — mergeGuestCartIntoUser: гостевая корзина привязывается или
  доливается в корзину пользователя (qty с потолком остатка/MAX_QTY); чужая корзина
  в cookie не сливается. Ставит cookie → звать только из server actions.
- src/app/account/login/actions.ts — requestCode / verifyCode / loginWithPassword.
  verifyCode при первом входе создаёт User (upsert по phone) = регистрация.
- src/app/account/login/page.tsx; src/components/account/LoginForm.tsx (client, вкладки
  «По телефону» и «Email и пароль», двухшаговый ввод кода).
- src/app/account/page.tsx — ЛК: профиль-карточка + «Мои заказы» (where userId OR phone —
  гостевые заказы подтягиваются); ссылки ведут на /order/<accessToken>.
- src/app/account/actions.ts — logout (удаляет сессию И cookie корзины).
- src/app/account/profile/{page.tsx, actions.ts}; src/components/account/ProfileForm.tsx —
  имя/email (P2002 → «email занят»), установка/смена пароля (требует email).
- src/components/Header.tsx — имя пользователя (или «Кабинет») вместо «Войти».
### Кросс-продажи
- src/lib/crosssell/config.ts — 16 правил «категория-источник → категории-цели» по НАЗВАНИЮ
  категории (точные regex с $, чтобы не подмешивать серверные/Enterprise ветки).
- src/lib/crosssell/query.ts — getCrossSell: accessories (по правилу, в наличии, без gism,
  перемешивание) + similar (та же категория, цена ±40%). Кэш дерева категорий 5 мин.
- src/components/product/CrossSell.tsx — блоки «С этим товаром покупают» и «Похожие товары».
- scripts/crosssell-check.ts — проверка правил по реальным названиям категорий.
- Запуск скриптов: `npx tsx scripts/<имя>.ts`; npm-скрипты: sync, sync:prices, sync:specs, probe, seed.
- .env (кроме DATABASE_URL и секретов): FLAT_MARKUP_PCT=10, SUPPLIER_PRICES_INCLUDE_VAT=true,
  VAT_PCT=22, SMS_PROVIDER= (пусто = локальный режим, код в консоль).

## 5. Ключевые решения (не пересматривать без причины)
- Кастомный стек вместо Битрикс.
- ЦЕНЫ СЕЙЧАС: плоская наценка 10% (FLAT_MARKUP_PCT) поверх цены поставщика как есть, без НДС,
  без потолка РРЦ. Причина: схема расчётов (нал/безнал, НДС по категориям) не прояснена.
  ОТЛОЖЕНО, НЕ ЗАБЫТЬ: матрица по категориям (код готов), потолок РРЦ (у 3918 товаров наша
  цена выше РРЦ), НДС. Возврат к этому — отдельная задача «Ц» после ответа поставщика/бухгалтера.
- Категории = зеркало дерева поставщика (3 уровня), ключ supplierId; slug по имени.
  Мусорные ветки (zzz…, Рекламные материалы, Услуги, Комплекты) не берём.
- Артикул товара = productId поставщика. Slug товара = бренд-название-productId.
- Защищённые поля: description и images не затираются; если пусто — заполняем от поставщика.
  specs всегда перезаписываются из Description; ProductAttribute перестраивается.
- Пропавшие из фида и isEol → деактивация. Категории без товаров → isActive=false.
- gism=true → флаг «Честный ЗНАК» (442 товара): в корзину НЕ кладём (кнопка «Скоро в продаже»),
  из кросс-продаж исключены. Откроем после ЭДО + кассы с маркировкой.
- Корзина: в БД, id в httpOnly-cookie lm_cart; userId null = гостевая. Цены в корзине
  не фиксируются (всегда актуальные), снимок — только в OrderItem. Кол-во ≤ остатка и ≤ 99.
- Заказ: статус строкой (new → confirmed → paid → shipped → done | cancelled), без enum —
  чтобы менять без миграций. Номер LM-000123. Страница заказа — по accessToken (cuid).
  Адрес — структурой (city/street/house/apartment/entrance/floor/intercom) под зоны доставки.
  deliveryCost=0 до шага 8 («рассчитаем при подтверждении»). Оплата после подтверждения менеджером.
- АВТОРИЗАЦИЯ (Шаг 4): регистрация ТОЛЬКО по телефону — аккаунт создаётся автоматически
  при первом входе по SMS-коду (User.phone обязателен/уникален, на нём держится подтягивание
  гостевых заказов). Email+пароль — ВТОРОЙ способ входа, задаётся в профиле. Отдельной
  регистрации по email нет — сознательно, чтобы не плодить аккаунты без телефона.
- Сессии в БД (Session, cookie lm_session, 30 дней), пароли — node:crypto scrypt.
  Сторонних auth-библиотек нет. SMS-код: 6 цифр, 5 минут, 5 попыток, повтор раз в минуту.
- При выходе удаляется и cookie корзины (общие компьютеры). «Мои заказы» = userId OR phone.
- Товар в заказе НЕ резервируется у поставщика (это шаг 6c); остаток на сайте не списываем.
- Фильтры: состояние в URL (?brand=MSI&vram=16+ГБ&instock=1&sort=price_asc) — ссылки для рекламы.
- Учёт: на старте «МойСклад» (счета, УПД, ЭДО, Честный ЗНАК, API), не 1С. Интеграция — шаг 5.
- Все обращения к API поставщика — с IP сервера (локально через прокси).
- Бренд: LOW-Market. CSS-токен цвета `volt` в Tailwind НЕ переименовывать.

## 6. Известные грабли
- Порт 22 к серверу недоступен из части сетей → запасной 443.
- Prisma в песочнице Claude не работает — типы проверяются заглушкой.
- После миграции VSCode подсвечивает новые модели красным → TypeScript: Restart TS Server.
- Prisma Studio: фильтр isNull не работает — считать через scripts/db-stats.ts.
- Многострочные вставки рвутся в терминале → команды по одной.
- Закрытый терминал = потерянный вывод; для долгих прогонов: `… *> data\sync.log`.
- Сертификат прокси надо выставлять в каждом новом терминале (NODE_EXTRA_CA_CERTS).
- Sticky-панель фильтров длиннее экрана не прокручивается — убрали sticky.
- Неконтролируемые чекбоксы не сбрасываются при смене URL → checked={…} + key на форме.
- Модуль с `import { cookies } from 'next/headers'` нельзя импортировать из 'use client'
  компонента (даже ради типа/константы) → общее выносим в *-shared.ts.
- cookies().set() работает только в server action / route handler, не в page.tsx.
- Из файла с 'use server' можно экспортировать ТОЛЬКО async-функции и типы (константы
  нельзя) → начальные состояния useFormState живут в клиентском компоненте.
- Длинные .tsx с вложенными шаблонными строками ломаются при копировании из чата →
  отдавать файлами на скачивание / в zip, синтаксис перед выдачей проверять esbuild-ом.
- useFormState с двумя формами (запрос кода / проверка кода): у формы проверки начальное
  состояние должно быть phase:'code', иначе шаг ввода кода никогда не покажется.
- Часть фото поставщика битые (404 на selstorage) — отсеем при переезде на своё хранилище.
- Товары иногда лежат «не на той полке» у поставщика (аксессуар в видеокартах) —
  переопределение категории сделаем в админке (шаг 5).
- Секрет прокси, токен и .env в чат не вставлять.

## 7. Следующий шаг (для нового чата)
1) Шаг 5 — админка: СНАЧАЛА решить модель доступа (предложение: поле role в User,
   role='admin' вручную через Prisma Studio / скрипт; /admin закрыт проверкой сессии).
   Состав: список заказов + смена статусов, карточка заказа (с закупкой/маржой из
   OrderItem.basePrice), экран SyncLog + алерты в Telegram, переопределение категории
   товара (поле categoryOverrideId), позже — модерация отзывов (шаг 9).
2) Выбрать SMS-провайдера и подключить в src/lib/sms/index.ts (интерфейс готов,
   меняется один файл). До этого вход по SMS работает только локально (код в консоль).
3) Параллельно (без кода, если ещё не сделано): письмо api@absoluttrade.ru — НДС в ценах,
   лимиты, категории с code=null, битые фото; бухгалтер — МойСклад; регистрация
   в Честном ЗНАКе и ЭДО.
4) Потом 6c (заказ у поставщика), затем 7 (ЮKassa).