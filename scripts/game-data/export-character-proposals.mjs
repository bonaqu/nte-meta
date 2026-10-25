// Prepare reviewable drafts for the authenticated admin UI. Never writes D1.
import { readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
for (const name of ['--database', '--current', '--output'])
  if (!process.argv.includes(name) || !arg(name))
    throw Error(`Missing ${name}`);
const currentPayload = JSON.parse(await readFile(arg('--current'), 'utf8'));
const current = currentPayload.data || currentPayload;
if (!Array.isArray(current)) throw Error('Invalid current character catalog');
const db = new DatabaseSync(arg('--database'), { readOnly: true });
const env = {
  DB: {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) {
          args = values;
          return this;
        },
        async all() {
          return { results: db.prepare(sql).all(...args) };
        },
        async first() {
          return db.prepare(sql).get(...args) || null;
        },
      };
    },
  },
};
const context = vm.createContext({
  URL,
  Response: globalThis.Response,
  Request: globalThis.Request,
  TextDecoder: globalThis.TextDecoder,
  TextEncoder: globalThis.TextEncoder,
  crypto: globalThis.crypto,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
});
new vm.Script(
  (await readFile('src/worker.js', 'utf8')).replace(
    'export default {',
    'const worker={',
  ) +
    ';globalThis.native={buildLocalGameCharacterSource,normalizeCharacterProfile};',
).runInContext(context);
const records = db
  .prepare(
    "SELECT e.value FROM game_source_chunks c,json_each(c.records_json)e WHERE json_extract(e.value,'$.namespace') IN ('ST_Player','DT_DefaultAppearanceData')",
  )
  .all()
  .map((r) => JSON.parse(r.value));
const active = new Set(
  records
    .filter((r) => r.namespace === 'DT_DefaultAppearanceData')
    .map((r) => r.gameId),
);
const key = (s) =>
  String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
const known = new Set(
  current.flatMap((c) => [key(c.name), key(c.originalName)]),
);
const seen = new Set(),
  proposals = [];
const nativeProfiles = [];
if (process.argv.includes('--native')) {
  for (const character of current) {
    const source = await context.native.buildLocalGameCharacterSource(env, {
      name: character.name,
      originalName: character.originalName,
    });
    nativeProfiles.push({
      name: character.originalName,
      status: source.status,
      suggestions: source.suggestions,
      message: source.message,
    });
  }
  await writeFile(
    arg('--native'),
    JSON.stringify({ characters: nativeProfiles }, null, 2) + '\n',
  );
}
for (const identity of records.filter(
  (r) => /^Role_Name_\d+$/.test(r.gameId) && active.has(r.ownerId),
)) {
  const name = identity.values.ru,
    originalName = identity.values.en;
  if (!name || !originalName || seen.has(key(originalName))) continue;
  seen.add(key(originalName));
  if (
    known.has(key(name)) ||
    known.has(key(originalName)) ||
    (/^zero$/i.test(originalName) && known.has('эсперзеро'))
  )
    continue;
  const source = await context.native.buildLocalGameCharacterSource(env, {
    name,
    originalName,
    gameDataOwnerId: identity.ownerId,
  });
  if (source.status !== 'ok') continue;
  const fields = Object.fromEntries(
    source.suggestions.map((s) => {
      let value;
      try {
        value = JSON.parse(s.value);
      } catch {
        value = s.value;
      }
      return [s.field, value];
    }),
  );
  const profile = context.native.normalizeCharacterProfile(
    Object.fromEntries(
      Object.entries(fields)
        .filter(([k]) => k.startsWith('profile.'))
        .map(([k, v]) => [k.slice(8), v]),
    ),
  );
  proposals.push({
    ownerId: identity.ownerId,
    name,
    originalName,
    slug:
      originalName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `character-${identity.ownerId}`,
    imageUrl: fields.imageUrl || '',
    splashUrl: fields.splashUrl || '',
    profile,
    sourceFields: Object.keys(fields),
  });
}
const bundle = {
  format: 'nte-character-proposals',
  version: 1,
  generatedAt: new Date().toISOString(),
  characters: proposals,
};
await writeFile(arg('--output'), JSON.stringify(bundle, null, 2) + '\n');
console.log(
  `Новых персонажей для проверки: ${proposals.length}. Файл: ${arg('--output')}`,
);
db.close();
