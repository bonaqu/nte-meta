// Rebind known imported media to exact assets from the installed game snapshot.
// No network requests or database writes. Ambiguous matches remain unresolved.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes('--output'))
  throw Error(
    'Pass --output <aliases JSON>; optionally --catalog <public catalog JSON>',
  );
const records = gunzipSync(
  await readFile('scripts/content/game-data/chunks.jsonl.gz'),
)
  .toString('utf8')
  .trim()
  .split('\n')
  .flatMap((line) => JSON.parse(line).records);
const images = new Map();
const families = new Map();
const family = (path) => {
  const lower = path.toLowerCase();
  return /\/ui_icon\/item(?:_100)?\//.test(lower)
    ? lower
        .replace('/item_100/', '/item/')
        .replace(/_(?:100|256)\.uasset$/, '.uasset')
    : lower;
};
for (const row of records.filter((row) => row.kind === 'image')) {
  const key = row.gameId.toLowerCase();
  images.set(key, [...(images.get(key) || []), ...row.assets]);
  for (const asset of row.assets) {
    const key = family(asset.path),
      previous = families.get(key);
    if (
      !previous ||
      asset.width * asset.height > previous.width * previous.height
    )
      families.set(key, asset);
  }
}
const canonical = new Map(
  records
    .filter((row) => row.kind === 'image')
    .flatMap((row) =>
      row.assets.map((a) => [a.url, families.get(family(a.path)).url]),
    ),
);
function image(key) {
  const options = images.get(key.toLowerCase());
  if (!options?.length) return;
  // These two native directories contain the same item icon at different sizes.
  const paths = new Set(options.map((a) => family(a.path)));
  if (paths.size !== 1) return;
  return families.get([...paths][0]).url;
}
function itemImage(stem) {
  return (
    image(stem) ||
    image(stem + '_256') ||
    image(stem + '_100') ||
    (/^food_\d{3}$/i.test(stem)
      ? image(stem.replace(/\d+$/, (n) => n.padStart(4, '0')))
      : undefined)
  );
}
const normalized = (value) =>
  String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
const names = new Map();
function nameAsset(name, url) {
  if (!name || !url?.startsWith('/nte-meta/game-assets/')) return;
  url = canonical.get(url) || url;
  const key = normalized(name),
    options = names.get(key) || new Set();
  if (!key) return;
  options.add(url);
  names.set(key, options);
}
for (const row of records) {
  if (row.kind === 'image') continue;
  const direct = row.assets?.find((a) =>
    a.url?.startsWith('/nte-meta/game-assets/'),
  )?.url;
  const stem = String(row.gameId).replace(/_name$/i, '');
  const localized = /_name$/i.test(row.gameId) ? itemImage(stem) : undefined;
  if (row.term)
    for (const name of Object.values(row.values))
      nameAsset(name, localized || direct);
}
const imported = new Map();
function collect(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === 'string' &&
      ['iconUrl', 'imageUrl', 'splashUrl'].includes(key) &&
      /^https?:/.test(item)
    ) {
      const rows = imported.get(item) || [];
      rows.push(value);
      imported.set(item, rows);
    } else if (typeof item === 'object') collect(item);
  }
}
let previousAliases = {};
if (process.argv.includes('--catalog'))
  collect(JSON.parse(await readFile(arg('--catalog'), 'utf8')));
else {
  previousAliases = JSON.parse(await readFile(arg('--output'), 'utf8'));
  collect(Object.keys(previousAliases).map((iconUrl) => ({ iconUrl })));
}
// Reference records prove name/ID equivalence for sources which omit zeroes in
// icon filenames (Food_128 vs the native Food_0128); do not guess by number.
for (const row of records)
  for (const asset of row.assets || []) {
    if (imported.has(asset.url))
      imported.get(asset.url).push({ name: row.values.ru });
  }
const aliases = {},
  unresolved = [];
for (const [url, rows] of imported) {
  const u = new URL(url);
  if (
    ![
      'interactivemap.app',
      'www.neverness.app',
      'static.wikia.nocookie.net',
    ].includes(u.hostname)
  )
    continue;
  const pieces = u.pathname.split('/').filter(Boolean);
  const filename = decodeURIComponent(
    pieces.at(u.hostname === 'static.wikia.nocookie.net' ? -3 : -1),
  );
  const stem = filename.replace(/\.(?:webp|png|jpe?g)$/i, '');
  const byName = new Set(
    rows
      .filter((row) => normalized(row.name))
      .flatMap((row) => [...(names.get(normalized(row.name)) || [])]),
  );
  let local =
    u.hostname === 'www.neverness.app' && byName.size === 1
      ? [...byName][0]
      : image(stem);
  if (!local && u.hostname === 'www.neverness.app') local = itemImage(stem);
  if (!local && byName.size === 1) local = [...byName][0];
  if (!local && u.hostname === 'static.wikia.nocookie.net') {
    const candidates = names.get(normalized(stem));
    if (candidates?.size === 1) local = [...candidates][0];
  }
  // The legacy Russian wiki title translated Water Moon Pick literally. The
  // reference item and the installed localization identify Worldboss_material_04.
  if (!local && normalized(stem) === normalized('Пик Водяной Луны'))
    local = image('Worldboss_material_04');
  const previous = previousAliases[url];
  if (!local && canonical.has(previous)) local = canonical.get(previous);
  if (local) aliases[url.split('?')[0]] = local;
  else unresolved.push({ url, stem });
}
await writeFile(
  arg('--output'),
  JSON.stringify(
    Object.fromEntries(
      Object.entries(aliases).sort(([a], [b]) => a.localeCompare(b)),
    ),
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({ mapped: Object.keys(aliases).length, unresolved }, null, 2),
);
