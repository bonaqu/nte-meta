import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
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
  Response:globalThis.Response,
  Request:globalThis.Request,
  TextDecoder:globalThis.TextDecoder,
  TextEncoder:globalThis.TextEncoder,
  crypto: globalThis.crypto,
  setTimeout:globalThis.setTimeout,
  clearTimeout:globalThis.clearTimeout,
});
new vm.Script(
  (await readFile('src/worker.js', 'utf8')).replace(
    'export default {',
    'const worker={',
  ) +
    '\nglobalThis.contracts={buildLocalGameCharacterSource,findLocalGameEquipment,gameTermReplacements};',
).runInContext(context);
const results = [];
for (const name of [
  'Hathor',
  'Akane Rin',
  'Hotori',
  'Blackbird',
  'Iroi',
  'Linko',
  'Zankou',
]) {
  const start = performance.now();
  const source = await context.contracts.buildLocalGameCharacterSource(env, {
    originalName: name,
  });
  results.push({
    name,
    status: source.status,
    fields: source.suggestions.map((s) => s.field),
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
if (
  localized.text.includes('Hathor') ||
  localized.text.includes('Far Side of the Moon')
)
  throw new Error('Official term localization failed');
console.log(
  JSON.stringify(
    { characters: results, arc: equipment.items[0], localized },
    null,
    2,
  ),
);
db.close();
