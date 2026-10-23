// Optional public reference for client tables that contain no rows.
// Kept separately so exported game data is never presented as external data.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';
const at = process.argv.indexOf('--source');
if (at < 0 || !process.argv[at + 1])
  throw new Error('Usage: fetch-supplement.mjs --source <extraction folder>');
const source = resolve(process.argv[at + 1]);
async function get(url) {
  const r = await fetch(url, { signal: globalThis.AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
}
const home = await (await get('https://nte.nanoka.cc/')).text();
const version = home.match(
  /https:\/\/static\.nanoka\.cc\/nte\/(\d+(?:\.\d+){1,3})\//,
)?.[1];
if (!version)
  throw new Error('The reference does not advertise a dataset version');
const base = `https://static.nanoka.cc/nte/${version}/`;
const index = await (await get(base + 'character.json')).json();
const characters = [];
const failures = [];
for (const row of Object.values(index)) {
  if (!/^\d+$/.test(row.id)) continue;
  const url = base + `en/character/${row.id}.json`;
  try {
    characters.push({ url, data: await (await get(url)).json() });
  } catch (e) {
    failures.push({ url, error: e.message });
  }
}
const items = await (await get(base + 'en/item.json')).json();
const weapons = [];
const weaponIndex = await (await get(base + 'weapon.json')).json();
for (const row of Object.values(weaponIndex)) {
  if (!/^[\w-]+$/.test(row.id)) continue;
  const url = base + `en/weapon/${row.id}.json`;
  try {
    weapons.push({ url, data: await (await get(url)).json() });
  } catch (e) {
    failures.push({ url, error: e.message });
  }
}
// Reuse the reviewed character aliases and the existing deterministic parsers.
const context = vm.createContext({ URL, crypto: globalThis.crypto });
new vm.Script(
  (
    await readFile(new URL('../../src/worker.js', import.meta.url), 'utf8')
  ).replace('export default {', 'const worker={') +
    ';globalThis.helpers={nevernessAppCharacterCode,parseHtmlJsonAttribute,knownGiftLocalizations};',
).runInContext(context);
const decode = (value) =>
  value
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const affinity = [];
const communityProfiles = [];
const giftCatalog = {};
const characterIndex = await (
  await get('https://www.kaiden.gg/nte/characters/')
).text();
const slugs = [
  ...characterIndex.matchAll(
    /<a\b[^>]*href="(\/nte\/characters\/[^"#]+)"[^>]*>([\s\S]*?)<\/a>/g,
  ),
].map((match) => ({
  path: match[1],
  name: decode(match[2].replace(/<[^>]+>/g, '')).trim(),
}));
for (const character of characters) {
  const id = character.data.id;
  const originalName = id === '1057' ? 'Akane' : character.data.name;
  const route = slugs.find(
    (row) => row.name.toLowerCase() === String(originalName).toLowerCase(),
  );
  if (route) {
    const url = 'https://www.kaiden.gg' + route.path;
    try {
      const page = await (await get(url)).text();
      const start = page.indexOf('Affinity Rewards');
      const end = page.slice(start).search(/<h[23]\b/);
      const area = page.slice(start, end > 0 ? start + end : undefined);
      const boundaries = [
        ...area.matchAll(/<span\b[^>]*>\s*Lv\.(\d+)\s*<\/span>/g),
      ];
      const levels = [];
      for (let index = 0; index < boundaries.length; index++) {
        const current = boundaries[index];
        const block = area.slice(current.index, boundaries[index + 1]?.index);
        const rewards = [];
        for (const item of block.matchAll(
          /<button\b([^>]*data-floating-tooltip-title="([^"]+)"[^>]*)>([\s\S]*?)<\/button>/g,
        )) {
          const quantity =
            item[1]
              .match(/data-floating-tooltip-subtitle="x([\d,]+)"/)?.[1]
              ?.replaceAll(',', '') || '1';
          const image = item[3].match(/<img\b[^>]*src="([^"]+)"/)?.[1] || '';
          rewards.push({
            name: decode(item[2]),
            quantity,
            icon: image ? new URL(image, url).href : '',
          });
        }
        if (rewards.length) levels.push({ level: Number(current[1]), rewards });
      }
      affinity.push({ ownerId: id, url, levels });
    } catch (e) {
      failures.push({ url, error: e.message });
    }
  }
  const code = context.helpers.nevernessAppCharacterCode({ originalName });
  if (code) {
    const url = 'https://www.neverness.app/characters/' + code;
    try {
      const page = await (await get(url)).text();
      communityProfiles.push({
        ownerId: id,
        url,
        levels: context.helpers.parseHtmlJsonAttribute(page, 'data-levels'),
        gifts: context.helpers.parseHtmlJsonAttribute(page, 'data-gifts'),
      });
      for (const gift of context.helpers.parseHtmlJsonAttribute(
        page,
        'data-gifts',
      )) {
        giftCatalog[gift.itemId] = {
          ...gift,
          nameRu: context.helpers.knownGiftLocalizations.get(gift.itemId) || '',
          sourceUrl: url,
        };
      }
    } catch (e) {
      failures.push({ url, error: e.message });
    }
  }
}
const report = {
  provider: 'Nanoka',
  version,
  checkedAt: new Date().toISOString(),
  characters,
  items,
  weapons,
  affinity,
  communityProfiles,
  giftCatalog,
  failures,
};
await writeFile(resolve(source, 'supplement.json'), JSON.stringify(report));
console.log(
  JSON.stringify({
    version,
    characters: characters.length,
    items: Object.keys(items).length,
    weapons: weapons.length,
    affinity: affinity.filter((row) => row.levels.length).length,
    gifts: Object.keys(giftCatalog).length,
    failures: failures.length,
  }),
);
