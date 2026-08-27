/**
 * Кросс-продажи: «С этим товаром покупают».
 *
 * Правило: ЕСЛИ товар лежит в категории, чьё название (на любом уровне цепочки)
 * подходит под `when`, ТО показываем товары из категорий, чьё название подходит
 * под один из `show` (берутся все категории-совпадения и их потомки).
 *
 * Матчим по НАЗВАНИЮ категории, а не по slug. Названия целей — ТОЧНЫЕ (с $),
 * чтобы к домашним товарам не подмешивались серверные категории
 * («… для серверов», «Enterprise», «для СХД»). Проверка: npx tsx scripts/crosssell-check.ts
 *
 * Порядок правил важен: берётся ПЕРВОЕ подошедшее. Порядок в `show` — приоритет показа.
 */
export interface CrossSellRule {
  id: string;
  when: RegExp;
  show: RegExp[];
}

// Переиспользуемые цели (названия категорий поставщика, проверены скриптом)
const MICE = /^мыши$/i;
const KEYBOARDS = /^клавиатуры$/i;
const MOUSEPADS = /^коврики для мышей$/i;
const CABLES = /^кабели и переходники$/i;
const PSU = /^блоки питания$/i;
const CASES = /^корпуса$/i;
const CPU = /^процессоры$/i;
const GPU = /^видеокарты$/i;
const MOBO = /^материнские платы (amd|intel) cpu$/i;
const RAM_DESKTOP = /^модули памяти desktop pc$/i;
const RAM_LAPTOP = /^модули памяти для ноутбуков$/i;
const SSD = /^накопители ssd$|^ssd (pci-e|клиентские sata|m\.2 sata|msata)$/i;
const HDD_DESKTOP = /^жесткие диски 3\.5" sata$/i;
const COOLING = /^кулеры и системы охлаждения cpu$|^термопаста$/i;
const CASE_FANS = /^вентиляторы для корпусов$/i;
const WEBCAMS = /^веб-камеры$/i;
const MOUNTS = /^кронштейны и подставки$/i;
const LAPTOP_BAGS = /^сумки для ноутбуков$/i;
const CHARGERS = /^зарядные устройства$/i;
const PHONE_CASES = /^чехлы для смартфонов$/i;
const SWITCHES = /^коммутаторы$/i;
const ROUTERS = /^беспроводные маршрутизаторы$/i;
const ACCESS_POINTS = /^беспроводные точки доступа$/i;
const IP_CAMERAS = /^ip-камеры$/i;
const NAS = /^nas$/i;

export const CROSS_SELL_RULES: CrossSellRule[] = [
  { id: 'laptop', when: /^ноутбук/i, show: [MICE, LAPTOP_BAGS, SSD, RAM_LAPTOP, MOUNTS] },
  { id: 'gpu', when: /^видеокарт/i, show: [PSU, CASES, CPU, MOBO, CABLES] },
  { id: 'cpu', when: /^процессор/i, show: [MOBO, COOLING, RAM_DESKTOP, GPU] },
  { id: 'motherboard', when: /^материнск/i, show: [CPU, RAM_DESKTOP, SSD, CASES, PSU] },
  { id: 'ram', when: /^модул.*памят|^оперативн/i, show: [MOBO, CPU, SSD] },
  { id: 'ssd', when: /^накопител|^ssd|^жестк/i, show: [MOBO, RAM_DESKTOP, CASES, CABLES] },
  { id: 'psu', when: /^блок.*питан/i, show: [CASES, GPU, MOBO, CABLES] },
  { id: 'case', when: /^корпус/i, show: [PSU, CASE_FANS, COOLING, MOBO] },
  { id: 'cooling', when: /^кулер|^вентилятор|^термопаст/i, show: [CPU, CASES, CASE_FANS, COOLING] },
  { id: 'monitor', when: /^монитор/i, show: [CABLES, MOUNTS, KEYBOARDS, MICE, WEBCAMS] },
  { id: 'keyboard-mouse', when: /^клавиатур|^мыш/i, show: [MOUSEPADS, MICE, KEYBOARDS, WEBCAMS] },
  { id: 'phone', when: /^смартфон/i, show: [PHONE_CASES, CHARGERS, CABLES] },
  { id: 'tv', when: /^телевизор/i, show: [MOUNTS, CABLES] },
  { id: 'network', when: /^коммутатор|^маршрутизатор|^беспроводн|^точк.*доступ/i, show: [CABLES, SWITCHES, ROUTERS, ACCESS_POINTS] },
  { id: 'ipcam', when: /^ip-камер|^видеонаблюд/i, show: [SWITCHES, NAS, HDD_DESKTOP, CABLES] },
  { id: 'nas', when: /^nas$|^сетев.*хранил/i, show: [HDD_DESKTOP, SSD, SWITCHES, CABLES] },
];

/** Сколько товаров показывать в блоке. */
export const CROSS_SELL_LIMIT = 8;
/** Сколько «похожих» показывать. */
export const SIMILAR_LIMIT = 8;