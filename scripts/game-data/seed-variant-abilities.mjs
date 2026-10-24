import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
export async function buildVariantAbilitySeed(native, characters) {
  const target = characters.find((row) => row.id === 'esper-zero');
  if (!target?.updatedAt || target.profile.appearanceVariants?.length !== 2)
    throw new Error('Observe the two published Zero variants first');
  const context = vm.createContext({ URL, TextEncoder, crypto: webcrypto });
  new vm.Script(
    (
      await readFile(new URL('../../src/worker.js', import.meta.url), 'utf8')
    ).replace('export default {', 'const worker={') +
      '\nglobalThis.normalizeVariants=normalizeCharacterAppearanceVariants;',
  ).runInContext(context);
  const sql = [
    '-- Fill native Zero abilities only while the observed character and variant media are unchanged.',
  ];
  for (const variant of target.profile.appearanceVariants) {
    if (!['1046', '1051'].includes(variant.id))
      throw new Error('Unexpected Zero owner');
    const profile = native.characters.find(
      (row) => row.ownerId === variant.id,
    )?.profile;
    if (profile?.abilities.length !== 7)
      throw new Error('Expected seven verified native abilities per variant');
    const normalized = context.normalizeVariants([
      { ...variant, abilities: profile.abilities },
    ])[0];
    const statement = `UPDATE character_appearance_variants SET abilities_json=${quote(JSON.stringify(normalized.abilities))}
      WHERE character_id=${quote(target.id)} AND variant_id=${quote(variant.id)} AND abilities_json='[]'
      AND name=${quote(variant.name)} AND json(skins_json)=json(${quote(JSON.stringify(variant.skins))})
      AND json(voice_lines_json)=json(${quote(JSON.stringify(variant.voiceLines))})
      AND EXISTS (SELECT 1 FROM characters WHERE id=${quote(target.id)} AND updated_at=${quote(target.updatedAt)});`;
    if (Buffer.byteLength(statement, 'utf8') > 90000)
      throw new Error('D1 query budget exceeded');
    sql.push(statement);
  }
  return sql.join('\n\n') + '\n';
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
      'Usage: --native <compiled.json> --current <observed.json> --output <migration.sql>',
    );
  const native = JSON.parse(await readFile(arg('--native'), 'utf8'));
  const current = JSON.parse(await readFile(arg('--current'), 'utf8'));
  await writeFile(
    arg('--output'),
    await buildVariantAbilitySeed(native, current.data || current),
  );
  console.log('Prepared guarded ability seed for 2 Zero variants.');
}
