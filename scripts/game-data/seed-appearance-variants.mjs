// Produce reviewable additive SQL; never contacts or writes the live database.
import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { TextEncoder } from 'node:util';
import { Buffer } from 'node:buffer';

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
export async function buildAppearanceVariantSeed(native, characters) {
  const target = characters.find((row) => row.id === 'esper-zero');
  if (!target?.updatedAt)
    throw new Error('An observed Esper Zero profile is required');
  const context = vm.createContext({ URL, TextEncoder, crypto: webcrypto });
  new vm.Script(
    (
      await readFile(new URL('../../src/worker.js', import.meta.url), 'utf8')
    ).replace('export default {', 'const worker={') +
      '\nglobalThis.normalizeVariants=normalizeCharacterAppearanceVariants;',
  ).runInContext(context);
  const variants = context.normalizeVariants(
    [
      ['1046', 'Мужской вариант'],
      ['1051', 'Женский вариант'],
    ].map(([id, name]) => {
      const profile = native.characters.find(
        (row) => row.ownerId === id,
      )?.profile;
      if (!profile?.skins?.length)
        throw new Error(`Verified native wardrobe missing for ${id}`);
      return {
        id,
        name,
        skins: profile.skins,
        voiceLines: profile.voiceLines || [],
      };
    }),
  );
  const lines = [
    '-- Add explicitly labelled native Zero variants. Existing profile fields are untouched.',
    '-- Skip a character edited since observation. Existing variant rows are never overwritten.',
  ];
  for (const [position, variant] of variants.entries()) {
    const sql = `INSERT OR IGNORE INTO character_appearance_variants
      (character_id, variant_id, name, skins_json, voice_lines_json, position)
      SELECT ${[target.id, variant.id, variant.name, JSON.stringify(variant.skins), JSON.stringify(variant.voiceLines)].map(quote).join(', ')}, ${position}
      WHERE EXISTS (SELECT 1 FROM characters WHERE id=${quote(target.id)} AND updated_at=${quote(target.updatedAt)})
      AND NOT EXISTS (SELECT 1 FROM character_appearance_variants WHERE character_id=${quote(target.id)} AND variant_id NOT IN ('1046','1051'));`;
    if (Buffer.byteLength(sql, 'utf8') > 90000)
      throw new Error('Variant seed exceeds the D1 query budget');
    lines.push(sql);
  }
  return { sql: lines.join('\n\n') + '\n', variants };
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
  if (
    !['--native', '--current', '--output'].every(
      (name) => process.argv.includes(name) && arg(name),
    )
  )
    throw new Error(
      'Usage: --native <compiled profiles.json> --current <observed characters.json> --output <migration.sql>',
    );
  const native = JSON.parse(await readFile(arg('--native'), 'utf8'));
  const current = JSON.parse(await readFile(arg('--current'), 'utf8'));
  const result = await buildAppearanceVariantSeed(
    native,
    current.characters || current.data || current,
  );
  await writeFile(arg('--output'), result.sql);
  console.log(
    JSON.stringify(
      result.variants.map((row) => ({
        id: row.id,
        skins: row.skins.length,
        voices: row.voiceLines.length,
      })),
    ),
  );
}
