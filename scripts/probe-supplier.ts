/**
 * Проба API поставщика: проверяет доступ и сохраняет "сырые" ответы в
 * data/supplier/probe/*.json, чтобы посмотреть реальный формат данных глазами.
 *
 * Запуск [VSCode терминал]:
 *   $env:NODE_EXTRA_CA_CERTS="C:\dev\voltshop\ops\nginx\supplier.crt"
 *   npx tsx scripts/probe-supplier.ts
 * Необязательно: код категории первым аргументом, чтобы пробовать конкретную:
 *   npx tsx scripts/probe-supplier.ts КОД_КАТЕГОРИИ
 */
import fs from 'node:fs';
import path from 'node:path';
import { AbsolutClient, flattenLeafCategories, totalStock } from '../src/lib/supplier/absolut';

// Минимальный загрузчик .env без зависимостей
function loadEnv(file = '.env') {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

const OUT_DIR = path.join('data', 'supplier', 'probe');
function save(name: string, data: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, name);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  console.log(`   → сохранено ${file}`);
}

async function main() {
  loadEnv();
  const api = new AbsolutClient();
  const wantedCategory = process.argv[2];

  console.log('1) Accounts/My — проверка токена…');
  const me = await api.accountsMy();
  console.log(`   OK: пользователь ${me.username}, компания: ${me.company?.name ?? '—'}`);

  console.log('2) CategoryTree…');
  const tree = await api.categoryTree();
  save('category-tree.json', tree);
  const leaves = flattenLeafCategories(tree);
  const withProducts = leaves.filter((l) => (l.totalProducts ?? 0) > 0);
  const total = withProducts.reduce((s, l) => s + (l.totalProducts ?? 0), 0);
  console.log(`   листовых категорий: ${leaves.length}, с товарами: ${withProducts.length}, товаров всего: ${total}`);
  const roots = Array.isArray(tree) ? tree : [tree];
  console.log('   верхний уровень:', roots.map((r) => r.name).join(' | '));

  console.log('3) Vendors…');
  const vendors = await api.vendors();
  save('vendors.json', vendors);
  console.log(`   вендоров: ${vendors.length}`);

  // Категория для пробы: заданная аргументом или самая маленькая непустая
  const target = wantedCategory
    ? withProducts.find((l) => l.code === wantedCategory)
    : [...withProducts].sort((a, b) => (a.totalProducts ?? 0) - (b.totalProducts ?? 0))[0];
  if (!target) {
    console.log('   Категория для пробы не найдена, стоп.');
    return;
  }
  console.log(`4) ProductSearch по категории "${target.path.join(' / ')}" (code=${target.code}, ${target.totalProducts} тов.)…`);
  const products = await api.productSearch({ categoryCodes: [target.code] });
  save(`products-${target.code}.json`, products);
  console.log(`   получено товаров: ${products.length}`);
  const first = products[0];
  if (!first) return;
  console.log(
    `   пример: #${first.productId} "${first.productName}" цена=${first.productPrice} rrp=${first.rrp ?? '—'} ` +
      `остаток=${totalStock(first.inStock)} склады=[${(first.inStock ?? []).map((s) => s.stock).join(', ')}] ` +
      `ЧЗ=${first.gism ?? '—'} eol=${first.isEol ?? '—'}`,
  );

  console.log(`5) Description для #${first.productId}…`);
  const desc = await api.descriptions([first.productId]);
  save(`description-${first.productId}.json`, desc);
  const lines = (Array.isArray(desc) ? desc[0]?.description : desc?.description) ?? [];
  console.log(`   характеристик: ${lines.length}`);
  for (const l of lines.slice(0, 5)) {
    console.log(`     ${l.complexName ?? ''} › ${l.criteria}: ${l.value} ${l.measurement ?? ''}`);
  }

  console.log(`6) MediaItems для #${first.productId}…`);
  const media = await api.mediaItems([first.productId]);
  save(`media-${first.productId}.json`, media);
  const links = (Array.isArray(media) ? media[0]?.mediaLinks : media?.mediaLinks) ?? [];
  console.log(`   медиа: ${links.length}`, links[0] ? `первое: ${links[0].mediaType} ${links[0].fullMediaLink}` : '');

  console.log('\nГотово. Пришлите вывод консоли и, если получится, файлы из data/supplier/probe.');
}

main().catch((e) => {
  console.error('ОШИБКА:', e?.message ?? e);
  process.exit(1);
});