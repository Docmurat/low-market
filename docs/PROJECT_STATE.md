# PROJECT_STATE — LOW-Market
Обновлено: 2026-08-26 (вехи: GitHub, ребрендинг + прокси/токен поставщика, клиент API + проба)
Файл живёт в репозитории: docs/PROJECT_STATE.md. Обновляется на каждой вехе.

## 1. Что за проект
Интернет-магазин техники LOW-Market (экс-«ВОЛЬТ»). Розница Москва/МО, компьютерная
техника — ядро ассортимента. Субдистрибьютор, кроссдокинг со склада поставщика
АБСОЛЮТ ТРЕЙД (группа ELKO), ~11 000 SKU через их API. ИП УСН.
Разработка: владелец + Claude, Windows/VSCode/GitHub/Yandex Cloud.

## 2. Дорожная карта и статус
| Шаг | Содержание | Статус |
|-----|-----------|--------|
| 1 | Каркас Next.js, БД, каталог, карточка, матрица наценок, пайплайн синка (мок) | ✅ |
| 1.5 | Ребрендинг ВОЛЬТ → LOW-Market (site.ts, layout, Header, Footer, README, .env) | ✅ |
| 6a | Доступ к API поставщика: прокси на сервере, токен, типизированный клиент, проба | ✅ РАБОТАЕТ |
| 6b | Реальный синк: категории → наша таблица, товары по категориям, цены/остатки, характеристики, фото; расписание | ⬜ СЛЕДУЮЩИЙ |
| 2 | Фильтры по характеристикам (из Description API), поиск, пагинация, сортировка | ⬜ после 6b |
| 3 | Корзина + чекаут + кросс-продажи | ⬜ |
| 4 | Авторизация, ЛК покупателя | ⬜ |
| 5 | Админка: заказы, статусы, отзывы | ⬜ |
| 6c | Создание заказа у поставщика (Shipment/CreateOrder), статусы отгрузок | ⬜ после 3 |
| 7 | ЮKassa: карты, СБП, чеки 54-ФЗ | ⬜ |
| 8 | Доставка: зоны Москва/МО | ⬜ |
| 9 | Отзывы + бонус за отзыв | ⬜ |
| 10 | B2B: оптовый заказ, счёт | ⬜ |
| 11 | PWA | ⬜ |
| 12 | Деплой: systemd, nginx для сайта, CI/CD, бэкапы БД, ужесточить SG, сменить SUPPLIER_PROXY_KEY | ⬜ |

## 3. Инфраструктура (актуально)
- GitHub: private-репозиторий `low-market` (ссылку даёт пользователь). Коммиты через
  Source Control в VSCode (Smart Commit включён). .env в git не попадает.
- ЛОКАЛЬНО: Windows. Node v24, npm 11, git 2.53. Проект в C:\dev\voltshop.
  PostgreSQL 17 порт 5433 (!), база voltshop, пользователь postgres.
  ВНИМАНИЕ: на 5432 — посторонний PostgreSQL 14 другого проекта, не трогать.
  Docker НЕ используется.
- СЕРВЕР: Yandex Cloud, ВМ voltshop-prod (Ubuntu 24.04, 2 vCPU/4ГБ, SSD 30ГБ, ru-central1-a).
  Статический IP 89.169.138.130. SSH: login ubuntu, ключ %USERPROFILE%\.ssh\voltshop,
  порты 22 И 443 (443 через /etc/systemd/system/ssh.socket.d/ports.conf).
  Установлено: Node 20, PostgreSQL 16, git, **nginx (поставлен 2026-08-26)**.
  БД на сервере — не создана (сверить на шаге 12). Группа безопасности Any/Any (ужесточить на шаге 12).
  VPN у пользователя нужен для Claude; для SSH/scp выключать. Cloud Shell/OS Login не работают.
- ПРОКСИ К ПОСТАВЩИКУ (на сервере): nginx, порт 8443, самоподписанный сертификат
  /etc/nginx/certs/supplier.{crt,key} (копия crt в репо: ops/nginx/supplier.crt),
  конфиг /etc/nginx/sites-available/supplier-proxy.conf (копия в репо ops/nginx/, секрет = CHANGE_ME).
  Адрес: https://89.169.138.130:8443/supplier/… → https://api.absoluttrade.ru/…
  Защита: заголовок X-Proxy-Key = SUPPLIER_PROXY_KEY из .env. Секрет засветился в чате —
  сменить на шаге 12 (sed в конфиге + reload nginx + .env).
  Для Node на ПК перед запуском скриптов: $env:NODE_EXTRA_CA_CERTS="C:\dev\voltshop\ops\nginx\supplier.crt"
- ПОСТАВЩИК — АБСОЛЮТ ТРЕЙД, eCommerce API v3 (swagger 2.0):
  документация https://api.absoluttrade.ru/local/docs/api/client/index.php,
  спецификация https://api.absoluttrade.ru/local/docs/api/client/openapi.json.
  Белый список: только IP сервера. Токен получен (CreateToken, поля username/password),
  действует 1 год, лежит в .env как SUPPLIER_API_TOKEN. НЕ вызывать CreateToken повторно —
  обнуляет текущий токен. Поддержка: api@absoluttrade.ru.
  Ключевые методы: Catalogs/CategoryTree, Catalogs/Vendors, Catalogs/ProductSearch (по
  categoryCodes; поля productId=elko-код, productName, manufacturerCode, vendorCode,
  categoryCode, catalogTree, productPrice, rrp, inStock[{stock,quantity}], gism (Честный ЗНАК),
  traceability, warranty, isEol, isNew, eanCodes, fromDateUpdate для инкремента),
  Catalogs/AvailabilityAndPrice (лёгкий: цена+остатки), Catalogs/Products/{ids}/Description
  (характеристики: criteria/value/measurement/complexName), Catalogs/MediaItems (фото),
  Shipment/CreateOrder (заказ, шаг 6c).
  Лимиты частоты в документации НЕ указаны; по аналогии с ELKO клиент держит паузу 3,2 с.
  Открытые вопросы к поставщику: лимиты, цены с НДС или без, пагинация ProductSearch.
- РЕЗУЛЬТАТ ПРОБЫ (data/supplier/probe/): 336 листовых категорий, 236 с товарами,
  11 112 товаров, 1122 вендора, склад в ответах — "MSK". Мусорные ветки дерева:
  "zzzНеИспользовать…", "Рекламные материалы", "Услуги", "Комплекты" — фильтровать.
  У пробного товара (PWL, #1248528) 0 характеристик и пустая ссылка фото — проверить на
  богатой категории (ноутбуки/видеокарты) перед проектированием синка.

## 4. Код (ключевые файлы)
- src/lib/site.ts — бренд (название/URL/описание), единая точка правды.
- src/lib/pricing.ts — матрица наценок по категориям (8–45%), floor, цены на …90.
- src/lib/supplier/absolut.ts — клиент API поставщика (типы, throttle, retry, flattenLeafCategories, totalStock).
- scripts/probe-supplier.ts — проба API, сохраняет сырые ответы в data/supplier/probe/.
- scripts/sync-supplier.ts — пока читает data/supplier-mock.json; переписать на клиент (шаг 6b).
- ops/nginx/supplier-proxy.conf, ops/nginx/supplier.crt — прокси к поставщику.
- Запуск скриптов: `npx tsx scripts/<имя>.ts` (в .env нет dotenv-зависимости: probe грузит .env сам).

## 5. Ключевые решения (не пересматривать без причины)
- Кастомный стек вместо Битрикс.
- Матрица наценок по категориям, floor-контроль (закупка + эквайринг 2% + буфер 3%), цены на …90.
  Теперь есть rrp от поставщика — использовать как верхний ориентир/для отображения «выгоды».
- Артикул товара = productId (elko-код) поставщика.
- Защищённые поля при синке: наше description и images не затираются; но если у нас пусто —
  заполнять из поставщика (Description/MediaItems).
- Пропавшие из фида товары деактивируются, не удаляются. isEol → деактивировать.
- Товары с gism=true помечать флагом «Честный ЗНАК» в схеме (влияет на маркировку/ЭДО).
- Разделение баз: локальная (разработка) и серверная (прод) — не смешивать.
- Все обращения к API поставщика идут с IP сервера (локально — через прокси).
- Налоги: закладывать НДС (порог УСН 20 млн будет превышен), ставка на согласовании с бухгалтером.
- Бренд: LOW-Market. CSS-токен цвета `volt` в Tailwind НЕ переименовывать.

## 6. Известные грабли
- Порт 22 к серверу недоступен из части сетей → запасной 443.
- ssh.socket (Ubuntu 24.04): порты добавлять в ssh.socket.d с явным 0.0.0.0.
- Пользователь на сервере — ubuntu (voltadmin из cloud-init не создался).
- Prisma в песочнице Claude не работает — Claude проверяет типы заглушкой.
- Многострочные вставки рвутся в терминале → команды по одной; на сервере файл
  создавать одной строкой через printf (scp с ПК часто путают с командой на сервере).
- scp/ssh запускать ТОЛЬКО в PowerShell на ПК; папка назначения на ПК должна существовать.
- CreateToken: поле называется username (не login).
- Секрет прокси и токен в чат не вставлять; .env в чат не вставлять.
- `-Exclude node_modules` в Get-ChildItem не исключает папку — фильтровать через Where-Object.

## 7. Следующий шаг (для нового чата)
1) Прогнать пробу на богатой категории: `npx tsx scripts/probe-supplier.ts <код>` (код взять из
   data/supplier/probe/category-tree.json, напр. ноутбуки или видеокарты), убедиться, что
   Description и MediaItems возвращают данные; прислать Claude json-файлы из data/supplier/probe.
2) Шаг 6b: расширить prisma-схему (supplierCategoryCode, vendor, rrp, gism, traceability,
   warranty, isEol, eanCodes, specs JSON, stock по складам), маппинг категорий поставщика на
   наши категории и матрицу наценок, переписать scripts/sync-supplier.ts на клиент API
   (полный синк + лёгкий синк цен/остатков), настроить расписание.
3) Затем Шаг 2 на реальных характеристиках.