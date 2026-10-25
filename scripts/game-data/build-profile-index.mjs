// Small, deterministic view index. The full multilingual corpus stays in D1.
import { writeFile } from 'node:fs/promises';
export async function buildProfileIndex(rows) {
  const key = (s) =>
    String(s || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
  const text = new Map(
    rows
      .filter((r) => r.values.ru)
      .map((r) => [key(r.namespace) + ':' + key(r.gameId), r.values.ru]),
  );
  const ru = (ref) =>
    text.get(
      key(
        String(ref?.TableId || '')
          .split('.')
          .at(-1),
      ) +
        ':' +
        key(ref?.Key),
    ) || '';
  const abilities = {};
  const nativeSkills = new Map(
    rows
      .filter((r) =>
        [
          'DT_GameplayAbilityTipsData',
          'DT_CharacterAbilityCityGroupConfig',
        ].includes(r.namespace),
      )
      .map((r) => [key(r.gameId), r]),
  );
  for (const row of rows.filter(
    (r) => r.namespace === 'NTE_ReferenceCharacter',
  )) {
    const menu = row.details.abilityMenu || [];
    const names = {};
    for (const [index, entry] of menu.entries()) {
      const native = nativeSkills.get(key(entry.id));
      for (const name of [
        entry.id,
        native?.values.ru,
        ru(native?.details.Name || native?.details.AbilityName),
      ])
        if (name) names[key(name)] = index;
    }
    for (const name of Object.values(row.values))
      if (name) abilities[key(name)] = names;
  }
  const equipment = [];
  for (const row of rows.filter((r) =>
    ['NTE_ReferenceWeapon', 'DT_EquipmentSuitData'].includes(r.namespace),
  )) {
    const imageUrl = row.assets.find((a) =>
      a.url?.startsWith('/nte-meta/game-assets/'),
    )?.url;
    if (!row.values.ru || !imageUrl) continue;
    equipment.push({
      id: row.gameId,
      kind: row.kind === 'arc' ? 'arcs' : 'cartridges',
      name: row.values.ru,
      names: [...new Set(Object.values(row.values).filter(Boolean))],
      imageUrl,
    });
  }
  await writeFile(
    'src/data/native-profile-index.json',
    JSON.stringify({ abilities, equipment }, null, 2) + '\n',
  );
  process.stdout.write(
    `Profile index: ${Object.keys(abilities).length} identities, ${equipment.length} equipment images\n`,
  );
}
