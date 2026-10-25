// Build a reviewable one-time enrichment migration. Never writes the live API.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const key = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(
      /^(?:базовая атака|обычная атака|навык перенаправления|навык поддержки|сверхспособность):\s*/,
      '',
    )
    .replace(/[^\p{L}\p{N}]/gu, '');
const identity = (field, row) =>
  field === 'awakenings'
    ? `${row.kind || 'awakening'}:${row.level}`
    : field === 'friendship'
      ? String(row.level)
      : field === 'voiceLines'
        ? key(row.language) +
          ':' +
          key(String(row.title || '').replace(/^(?:обо|об|о)\s+/i, ''))
        : field === 'voiceActors'
          ? key(row.language)
          : field === 'baseStats'
            ? key(row.label).startsWith('шанскрит')
              ? 'crit'
              : key(row.label).includes('крит')
                ? 'critDamage'
                : key(row.label)
            : key(row.name);
const legacyVoicePlaceholder = (row) =>
  /^https:\/\/static\.wikia\.nocookie\.net\/neverness-to-everness\/images\/[^/]+\/[^/]+\/VO_/.test(
    row.audioUrl || '',
  ) &&
  /^Прямая запись .*Расшифровку и соответствие реплики проверьте в источнике перед публикацией\.$/.test(
    row.description || '',
  );
export function mergeNativeCollection(field, current, incoming) {
  const used = new Set();
  const result = incoming.map((row) => {
    const index = current.findIndex(
      (old, i) =>
        !used.has(i) &&
        ((row.id && row.id === old.id) ||
          identity(field, row) === identity(field, old)),
    );
    if (index < 0) return row;
    used.add(index);
    const old = current[index];
    const merged = { ...row, ...old };
    if (
      field === 'voiceLines' &&
      legacyVoicePlaceholder(old) &&
      row.description
    )
      merged.description = row.description;
    // Refresh installed voice packs while retaining explicit administrator uploads.
    if (
      field === 'voiceLines' &&
      /^(?:\/nte-meta\/game-audio\/[a-f0-9]{20}\.ogg$|https:\/\/static\.wikia\.nocookie\.net\/neverness-to-everness\/images\/[^/]+\/[^/]+\/VO_)/.test(
        old.audioUrl || '',
      ) &&
      row.audioUrl
    )
      merged.audioUrl = row.audioUrl;
    for (const name of [
      'iconUrl',
      'imageUrl',
      'audioUrl',
      'description',
      'effect',
      'source',
    ])
      if (!old[name] && row[name]) merged[name] = row[name];
    for (const name of ['attributes', 'rewards'])
      if (!old[name]?.length && row[name]) merged[name] = row[name];
    if (
      row.description &&
      (/^Описание (?:навыка )?требует проверки(?: в игре)?\.$/.test(
        old.description || '',
      ) ||
        (field === 'friendship' &&
          /Награда за уровень[^.]*не указана/i.test(old.description || '')))
    )
      merged.description = row.description;
    return merged;
  });
  for (const [index, row] of current.entries())
    if (
      !used.has(index) &&
      !(
        field === 'voiceLines' &&
        /^https:\/\/static\.wikia\.nocookie\.net\/neverness-to-everness\/images\/[^/]+\/[^/]+\/VO_/.test(
          row.audioUrl || '',
        ) &&
        result.some(
          (value) =>
            identity(field, value) === identity(field, row) ||
            (legacyVoicePlaceholder(row) && value.language === row.language),
        )
      ) &&
      !(
        field === 'abilities' &&
        (/^GA_.+_name$/.test(row.id) || /^не введено$/i.test(row.name))
      )
    )
      result.push(row);
  const limits = {
    abilities: 30,
    awakenings: 9,
    friendship: 10,
    gifts: 40,
    skins: 30,
    voiceLines: 500,
    materials: 80,
    baseStats: 40,
    roleIcons: 12,
    voiceActors: 12,
    roleTags: 12,
  };
  if (result.length > (limits[field] || 80))
    throw new Error(
      `${field}: enrichment exceeds schema, manual review required (${result.length})`,
    );
  return result;
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
function collectionUpdates(table, column, rows, guard) {
  const lines = [];
  let batch = [],
    size = 0,
    first = true;
  function flush() {
    if (!batch.length) return;
    const value = quote(JSON.stringify(batch));
    lines.push(
      `UPDATE ${table} SET ${column}=${first ? `json(${value})` : `(SELECT json_group_array(json(value)) FROM (SELECT value FROM json_each(${column}) UNION ALL SELECT value FROM json_each(${value})))`} WHERE ${guard};`,
    );
    first = false;
    batch = [];
    size = 0;
  }
  for (const row of rows) {
    const length = Buffer.byteLength(JSON.stringify(row), 'utf8');
    if (length > 65000)
      throw Error('One profile row exceeds migration query budget');
    if (size + length > 65000) flush();
    batch.push(row);
    size += length;
  }
  flush();
  return lines;
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  if (
    !['--native', '--current', '--output'].every(
      (name) =>
        process.argv.includes(name) &&
        process.argv[process.argv.indexOf(name) + 1],
    )
  )
    throw new Error(
      'Usage: seed-profiles.mjs --native <verified profiles JSON> --current <observed API characters JSON> --output <reviewed migration.sql>',
    );
  const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
  const currentPath = arg('--current'),
    native = JSON.parse(await readFile(arg('--native'), 'utf8'));
  const current = JSON.parse(await readFile(currentPath, 'utf8'));
  const captured = (await stat(currentPath)).mtime
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  const lines = [
    `-- Enrich observed published profiles from the validated local snapshot.\n-- Preserve nonempty manual fields; skip characters edited after observation (${captured} UTC).`,
  ];
  const columns = {
    abilities: 'abilities_json',
    awakenings: 'awakenings_json',
    friendship: 'friendship_json',
    gifts: 'gifts_json',
    skins: 'skins_json',
    voiceLines: 'voice_lines_json',
    materials: 'materials_json',
    baseStats: 'base_stats_json',
    roleIcons: 'role_icons_json',
    voiceActors: 'voice_actors_json',
  };
  const report = [];
  for (const character of current) {
    const source = native.characters.find(
      (row) => row.name === character.originalName,
    );
    if (!source || source.status !== 'ok') {
      report.push({
        character: character.name,
        skipped: source?.message || 'No native identity',
      });
      continue;
    }
    const guard = `character_id=${quote(character.id)} AND updated_at<=${quote(captured)} AND EXISTS(SELECT 1 FROM characters WHERE id=character_id AND updated_at=${quote(character.updatedAt)})`;
    let changed = 0;
    for (const suggestion of source.suggestions || []) {
      const field = suggestion.field.replace(/^profile\./, '');
      if (field === 'appearanceVariants') {
        for (const variant of JSON.parse(suggestion.value)) {
          const before = (character.profile.appearanceVariants || []).find(
            (v) => v.id === variant.id,
          );
          if (!before) continue;
          for (const [name, column] of [
            ['voiceLines', 'voice_lines_json'],
            ['abilities', 'abilities_json'],
            ['skins', 'skins_json'],
          ]) {
            const incoming = variant[name] || [];
            if (!incoming.length) continue;
            const merged = mergeNativeCollection(
              name,
              before[name] || [],
              incoming,
            );
            if (JSON.stringify(merged) === JSON.stringify(before[name]))
              continue;
            const condition = `character_id=${quote(character.id)} AND variant_id=${quote(variant.id)} AND EXISTS(SELECT 1 FROM character_profiles WHERE ${guard})`;
            lines.push(
              ...collectionUpdates(
                'character_appearance_variants',
                column,
                merged,
                condition,
              ),
            );
            changed++;
          }
        }
        continue;
      }
      const column = columns[field];
      if (!column) continue;
      const incoming = JSON.parse(suggestion.value);
      if (!incoming.length) continue;
      const before = character.profile[field] || [];
      const merged = mergeNativeCollection(field, before, incoming);
      if (JSON.stringify(before) === JSON.stringify(merged)) continue;
      // Keep every SQL statement below D1's 100 KB query limit. A rerun starts
      // each array again; interrupted generation/import cannot append duplicates.
      lines.push(
        ...collectionUpdates('character_profiles', column, merged, guard),
      );
      changed++;
    }
    if (changed)
      lines.push(
        `UPDATE character_profiles SET updated_at=CURRENT_TIMESTAMP WHERE ${guard};`,
      );
    report.push({ character: character.name, collections: changed });
  }
  if (lines.some((line) => Buffer.byteLength(line, 'utf8') > 100000))
    throw new Error('Migration query exceeds D1 limit');
  await writeFile(arg('--output'), lines.join('\n\n') + '\n');
  console.log(JSON.stringify(report, null, 2));
}
