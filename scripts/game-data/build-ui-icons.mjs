// Exact native item names and attribute textures, regenerated after extraction.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const rows = gunzipSync(
  await readFile('scripts/content/game-data/chunks.jsonl.gz'),
)
  .toString('utf8')
  .trim()
  .split('\n')
  .flatMap((line) => JSON.parse(line).records);
const images = rows.filter((row) => row.kind === 'image');
const byId = new Map();
for (const row of images) {
  for (const asset of row.assets) {
    const key = row.gameId.toLowerCase();
    const previous = byId.get(key);
    if (
      !previous ||
      asset.width * asset.height > previous.width * previous.height
    )
      byId.set(key, asset);
  }
}
const normalize = (name) =>
  String(name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
const candidates = new Map();
for (const row of rows.filter((row) => row.kind === 'item' && row.values.ru)) {
  const stem = row.gameId
    .replace(/^(?:item_)/i, '')
    .replace(/_name$/i, '')
    .toLowerCase();
  const asset =
    row.assets?.find((asset) =>
      asset.url?.startsWith('/nte-meta/game-assets/'),
    ) ||
    byId.get(stem) ||
    byId.get(stem + '_256');
  if (!asset) continue;
  const key = normalize(row.values.ru);
  const urls = candidates.get(key) || new Set();
  urls.add(asset.url);
  candidates.set(key, urls);
}
// An ambiguous localized name must never choose an unrelated item icon.
const items = Object.fromEntries(
  [...candidates]
    .filter(([, urls]) => urls.size === 1)
    .map(([name, urls]) => [name, [...urls][0]])
    .sort(([a], [b]) => a.localeCompare(b)),
);
// Retained RU wiki translation of Dress Sleeves of Vanity; native localization
// now calls the same weekly Arachne material Dress Hem of Vanity.
if (items[normalize('Подол платья тщеславия')])
  items[normalize('Показушное платье с рукавами')] =
    items[normalize('Подол платья тщеславия')];
// The published legacy label is already bound to SpecialGift_letter in the
// description registry. Use the same native texture without renaming content.
if (items[normalize('Рукописное письмо')])
  items[normalize('Письмо, написанное от руки')] =
    items[normalize('Рукописное письмо')];
const attributes = Object.fromEntries(
  images
    .filter((row) =>
      row.assets.some((asset) => /\/attribute\//i.test(asset.path)),
    )
    .map((row) => [row.gameId, row.assets[0].url])
    .sort(([a], [b]) => a.localeCompare(b)),
);
for (const row of rows.filter(
  (row) => row.namespace === 'DT_AttributeStaticData',
)) {
  const stem = row.details.AttributeIcon?.AssetPathName?.split('.')
    .at(-1)
    ?.toLowerCase();
  if (attributes[stem]) attributes[row.gameId] = attributes[stem];
}
await writeFile(
  'src/data/native-item-icons.json',
  JSON.stringify(items, null, 2) + '\n',
);
await writeFile(
  'src/data/native-stat-icons.json',
  JSON.stringify(attributes, null, 2) + '\n',
);
process.stdout.write(
  JSON.stringify({
    items: Object.keys(items).length,
    attributes: Object.keys(attributes).length,
  }) + '\n',
);
const { buildItemDescriptions } = await import('./build-item-descriptions.mjs');
await buildItemDescriptions(rows);
const { buildNativeItems } = await import('./build-native-items.mjs');
await buildNativeItems(rows);
