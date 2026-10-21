import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

// Export the reviewed static registry to D1 without changing editor preferences.
const code = await readFile(
  new URL('../src/worker.js', import.meta.url),
  'utf8',
);
const context = vm.createContext({ URL });
new vm.Script(
  code.replace('export default {', 'const worker = {') +
    '\nglobalThis.registry = LEAK_DISCOVERY_SOURCES;',
).runInContext(context);
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const lines = [
  '-- Registry audited 2026-10-21. Existing switches/names/trust are preserved.',
];
for (const source of context.registry) {
  const type = ['website', 'telegram', 'twitter/x'].includes(source.type)
    ? source.type
    : 'website';
  lines.push(`INSERT OR IGNORE INTO sources (id, source_type, source_name, source_url, trust_level, auto_import_enabled)
SELECT ${[`discovery-${source.id}`, type, source.name, source.url, source.trustLevel].map(quote).join(', ')}, ${source.referenceOnly ? 0 : 1}
WHERE NOT EXISTS (SELECT 1 FROM sources WHERE source_url = ${quote(source.url)});`);
}
for (const [id, url] of [
  ['leaks-telegram-nte', 'https://t.me/s/NTE_Neverness_to_Everness'],
  ['leaks-telegram-stardust', 'https://t.me/s/StardustLeaks'],
]) {
  lines.push(
    `UPDATE sources SET auto_import_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ${quote(id)} AND source_url = ${quote(url)};`,
  );
}
await writeFile(
  new URL('../migrations/0032_refresh_discovery_sources.sql', import.meta.url),
  lines.join('\n\n') + '\n',
);
