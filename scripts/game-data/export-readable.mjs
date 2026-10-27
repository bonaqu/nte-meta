// Offline semantic export. Reuse the site's native-data parser, never call a network service.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!process.argv.includes('--output') || !output)
  throw new Error('Pass --output <file.json>');
const db = new DatabaseSync(':memory:');
db.exec(await readFile('migrations/0036_local_game_reference.sql', 'utf8'));
for (const name of ['game_chunks_ai', 'game_chunks_ad', 'game_chunks_au'])
  db.exec('DROP TRIGGER ' + name);
const insert = db.prepare(
  'INSERT INTO game_source_chunks(id,kind,records_json,search_text,source_hash,record_count) VALUES(?,?,?,?,?,?)',
);
console.log('Читаем проверенный снимок игры…');
for (const line of gunzipSync(
  await readFile('scripts/content/game-data/chunks.jsonl.gz'),
)
  .toString('utf8')
  .trim()
  .split('\n')) {
  const chunk = JSON.parse(line);
  insert.run(
    chunk.id,
    chunk.kind,
    JSON.stringify(chunk.records),
    chunk.search,
    chunk.hash,
    chunk.count,
  );
}
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
    '\nglobalThis.reader={buildLocalGameCharacterSource,buildLocalGameGuideSources,normalizeCharacterProfile,findLocalGameEquipment,handleGameData};',
).runInContext(context);
const select = (where) =>
  db
    .prepare(
      'SELECT e.value FROM game_source_chunks c,json_each(c.records_json)e WHERE ' +
        where,
    )
    .all()
    .map((r) => JSON.parse(r.value));
const identities = select(
  "c.kind='character' AND json_extract(e.value,'$.namespace') IN ('ST_Player','NTE_ReferenceCharacter')",
);
const characters = [];
for (const appearance of select(
  "json_extract(e.value,'$.namespace')='DT_DefaultAppearanceData'",
)) {
  const identity =
    identities.find(
      (r) =>
        r.ownerId === appearance.gameId &&
        r.namespace === 'NTE_ReferenceCharacter',
    ) ||
    identities.find(
      (r) =>
        r.ownerId === appearance.gameId && r.gameId.startsWith('Role_Name_'),
    );
  if (!identity)
    throw new Error('No character identity for ' + appearance.gameId);
  const name = identity.values.ru || identity.values.en || appearance.gameId;
  console.log('Досье персонажа: ' + name);
  const source = await context.reader.buildLocalGameCharacterSource(env, {
    name,
    originalName: identity.values.en,
    gameDataOwnerId: appearance.gameId,
  });
  if (source.status !== 'ok')
    throw new Error('Cannot compile ' + name + ': ' + source.message);
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
  const profile = context.reader.normalizeCharacterProfile(
    Object.fromEntries(
      Object.entries(fields)
        .filter(([key]) => key.startsWith('profile.'))
        .map(([key, value]) => [key.slice(8), value]),
    ),
  );
  characters.push({
    ownerId: appearance.gameId,
    name,
    values: identity.values,
    fields,
    profile,
    recommendations: (
      await context.reader.buildLocalGameGuideSources(env, {
        name,
        originalName: identity.values.en,
        gameDataOwnerId: appearance.gameId,
      })
    )[0]?.recommendations,
  });
}
const equipment = [];
const seen = new Set();
for (const row of select(
  "json_extract(e.value,'$.namespace') IN ('NTE_ReferenceWeapon','DT_EquipmentSuitData') AND json_extract(e.value,'$.term')=1",
)) {
  const kind = row.namespace === 'NTE_ReferenceWeapon' ? 'arcs' : 'cartridges';
  const name = row.values.ru || row.values.en;
  if (!name || seen.has(kind + ':' + name)) continue;
  seen.add(kind + ':' + name);
  console.log('Экипировка: ' + name);
  const source = await context.reader.findLocalGameEquipment(env, name, kind);
  const item =
    source.items.find((item) => item.name === name) || source.items[0];
  if (item)
    equipment.push({
      ...item,
      kind,
      gameId: row.gameId,
      values: row.values,
      details: row.details,
    });
}
const progression = (
  await (
    await context.reader.handleGameData(
      new globalThis.Request(
        'https://offline.invalid/api/game-data/progression',
      ),
      env,
      ['game-data', 'progression'],
    )
  ).json()
).data;
await writeFile(output, JSON.stringify({ characters, equipment, progression }));
console.log(
  'Подготовлено досье: ' +
    characters.length +
    '; дуг и картриджей: ' +
    equipment.length,
);
db.close();
