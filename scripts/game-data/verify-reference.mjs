import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';
const database = process.argv[process.argv.indexOf('--database') + 1];
if (!process.argv.includes('--database') || !database)
  throw new Error('Pass --database <validated SQLite snapshot>');
const db = new DatabaseSync(database, { readOnly: true });
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
    '\nglobalThis.contracts={buildLocalGameCharacterSource,findLocalGameEquipment,gameTermReplacements,normalizeCharacterProfile,handleGameData};',
).runInContext(context);
const results = [];
const characterFile = process.argv.includes('--characters')
  ? process.argv[process.argv.indexOf('--characters') + 1]
  : '';
const names = characterFile
  ? JSON.parse(await readFile(characterFile, 'utf8')).map((c) => ({
      name: c.name,
      originalName: c.originalName,
    }))
  : process.argv.includes('--all')
    ? db
        .prepare(
          "SELECT e.value FROM game_source_chunks c,json_each(c.records_json)e WHERE json_extract(e.value,'$.namespace')='ST_Player' AND json_extract(e.value,'$.gameId') LIKE 'Role_Name_%' AND json_extract(e.value,'$.ownerId') IN (SELECT json_extract(f.value,'$.gameId') FROM game_source_chunks d,json_each(d.records_json)f WHERE json_extract(f.value,'$.namespace')='DT_DefaultAppearanceData')",
        )
        .all()
        .map((row) => {
          const record = JSON.parse(row.value);
          return { originalName: record.values.en, name: record.values.ru };
        })
    : [
        'Hathor',
        'Akane Rin',
        'Hotori',
        'Blackbird',
        'Iroi',
        'Linko',
        'Zankou',
      ].map((originalName) => ({ originalName }));
for (const character of names) {
  const name = character.originalName;
  const start = performance.now();
  const source = await context.contracts.buildLocalGameCharacterSource(
    env,
    character,
  );
  const profile = Object.fromEntries(
    source.suggestions
      .filter((s) => s.field.startsWith('profile.'))
      .map((s) => {
        let value;
        try {
          value = JSON.parse(s.value);
        } catch {
          value = s.value;
        }
        return [s.field.slice(8), value];
      }),
  );
  context.contracts.normalizeCharacterProfile(profile);
  if (!characterFile && source.status !== 'ok')
    throw new Error(`Native profile failed for ${name}: ${source.message}`);
  results.push({
    name,
    status: source.status,
    message: source.message,
    fields: source.suggestions.map((s) => s.field),
    coverage: Object.fromEntries(
      source.suggestions.map((s) => {
        let value;
        try {
          value = JSON.parse(s.value);
        } catch {
          value = s.value;
        }
        return [
          s.field,
          Array.isArray(value)
            ? {
                count: value.length,
                missingIcons: value.filter(
                  (row) =>
                    ('iconUrl' in row || 'imageUrl' in row) &&
                    !(row.iconUrl || row.imageUrl),
                ).length,
              }
            : true,
        ];
      }),
    ),
    suggestions: process.argv.includes('--details')
      ? source.suggestions
      : undefined,
    elapsedMs: Math.round(performance.now() - start),
  });
}
const equipment = await context.contracts.findLocalGameEquipment(
  env,
  'Far Side of the Moon',
  'arcs',
);
if (!equipment.items.length)
  throw new Error('Local arc lookup did not return an item');
const localized = await context.contracts.gameTermReplacements(
  env,
  'Hathor uses Far Side of the Moon.',
);
const progression = (
  await (
    await context.contracts.handleGameData(
      new globalThis.Request('https://example.com/api/game-data/progression'),
      env,
      ['game-data', 'progression'],
    )
  ).json()
).data;
if (
  progression.experienceItems.length !== 6 ||
  progression.characterExp.length !== 80
)
  throw new Error('Incomplete progression reference');
if (
  localized.text.includes('Hathor') ||
  localized.text.includes('Far Side of the Moon')
)
  throw new Error('Official term localization failed');
console.log(
  JSON.stringify(
    {
      characters: results,
      arc: equipment.items[0],
      localized,
      progression: {
        options: progression.costs.length,
        characterExp: progression.characterExp.length,
        arcExp: progression.arcExp.length,
        experienceItems: progression.experienceItems.length,
      },
    },
    null,
    2,
  ),
);
db.close();
