// Russian item details from the extracted localization. No machine-generated lore.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

import { pathToFileURL } from 'node:url';

export async function buildItemDescriptions(rows) {
  const normalize = (value) =>
    String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
  const clean = (value) =>
    String(value || '')
      .replace(/<[^>]*>/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  const namespaces = new Set([
    'ST_Item',
    'ST_food',
    'ST_Likeability',
    'ST_Appearance',
  ]);
  const texts = rows.filter((row) => namespaces.has(row.namespace));
  const localized = new Map(
    texts.map((row) => [
      row.namespace + ':' + row.gameId.toLowerCase(),
      row.values.ru,
    ]),
  );
  const uiTexts = new Map(
    rows
      .filter((row) => row.namespace === 'ST_Ui')
      .map((row) => [row.gameId.toLowerCase(), row.values.ru]),
  );
  const byId = {};
  const candidates = new Map();
  for (const row of texts) {
    const id = row.gameId.replace(/_name$/i, '').toLowerCase();
    const name = clean(row.values.ru);
    const get = (suffixes) =>
      suffixes
        .map((suffix) => localized.get(row.namespace + ':' + id + suffix))
        .find(Boolean);
    const description = clean(get(['_desc', '_des']));
    const usage = clean(get(['_usedesc', '_usedes', '_use']));
    if (!name || !(description || usage)) continue;
    const detail = {
      name,
      description,
      usage: usage === description ? '' : usage,
    };
    byId[id] = detail;
    for (const label of [name, row.values.en]) {
      const key = normalize(label);
      if (!key) continue;
      const values = candidates.get(key) || new Map();
      values.set(id, {
        id,
        english: normalize(row.values.en),
        priority: [
          'ST_Likeability',
          'ST_Appearance',
          'ST_food',
          'ST_Item',
        ].indexOf(row.namespace),
      });
      candidates.set(key, values);
    }
  }
  // A non-unique label cannot silently choose a different item's description.
  const byName = {};
  for (const [key, values] of candidates) {
    const choices = [...values.values()].sort(
      (a, b) => b.priority - a.priority,
    );
    if (choices.length === 1) byName[key] = choices[0].id;
    else if (
      choices.every((row) => row.english && row.english === choices[0].english)
    ) {
      const preferred = choices.filter(
        (row) => row.priority === choices[0].priority,
      );
      if (
        preferred.length === 1 ||
        preferred.every(
          (row) =>
            JSON.stringify(byId[row.id]) ===
            JSON.stringify(byId[preferred[0].id]),
        )
      )
        byName[key] = preferred[0].id;
    }
  }
  const aliases = {};
  for (const row of rows.filter((row) =>
    [
      'NTE_ReferenceItem',
      'NTE_ReferenceGift',
      'NTE_ReferenceCurrency',
    ].includes(row.namespace),
  )) {
    const key = normalize(row.values.ru);
    const id = row.gameId.toLowerCase();
    if (byName[key]) aliases[id] = byName[key];
    else {
      // Currency labels live outside ST_Item; their use text still uses item_ID.
      const usage = clean(localized.get('ST_Item:item_' + id + '_usedesc'));
      if (usage && row.values.ru) {
        byId[id] = {
          name: row.values.ru,
          description: clean(uiTexts.get(id + '_desc')),
          usage,
        };
        byName[key] = id;
      }
    }
  }
  // Legacy published gift label, tied to the same SpecialGift_letter item.
  // This currency's two localized fields are reversed relative to normal items.
  if (byId.item_annulith) {
    const item = byId.item_annulith;
    [item.description, item.usage] = [item.usage, item.description];
  }
  if (byId.specialgift_letter)
    byName[normalize('Письмо, написанное от руки')] = 'specialgift_letter';
  // Ship only profile-related items; the full game database stays in the native
  // archive. A tooltip must not download thousands of unrelated furniture rows.
  const wanted = new Set();
  const keep = (value) => {
    if (typeof value !== 'string') return;
    const key = value.toLowerCase();
    const id = aliases[key] || (byId[key] ? key : byName[normalize(value)]);
    if (id) wanted.add(id);
  };
  const walk = (value) => {
    if (typeof value === 'string') keep(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(walk);
  };
  for (const row of rows) {
    if (
      [
        'NTE_ReferenceCharacter',
        'NTE_ReferenceWeapon',
        'NTE_ReferenceGift',
        'NTE_ReferenceCurrency',
        'NTE_ReferenceFashion',
        'NTE_ReferenceAffinity',
        'NTE_ReferenceCommunityProfile',
        'DT_LikeabilityGiftData',
      ].includes(row.namespace) ||
      (row.namespace === 'DropSequenceDataTable' &&
        /likeability/i.test(row.gameId)) ||
      /Cultivation|Role.*(?:Skill|Break|Level)|Skill.*Level/i.test(
        row.namespace,
      ) ||
      row.details.upgradeUsage ||
      /^item_(?:SkillUpMaterial|weekboss)/i.test(row.gameId)
    ) {
      keep(row.gameId);
      keep(row.values.ru);
      walk(row.details);
    }
  }
  const common = new Map(
    rows
      .filter((row) => row.namespace === 'ST_Common')
      .map((row) => [row.gameId, row.values.ru]),
  );
  const types = new Map(
    rows
      .filter((row) => row.namespace === 'DT_ItemType')
      .map((row) => [row.gameId, common.get(row.details.TypeName?.Key)]),
  );
  const references = new Map(
    rows
      .filter((row) => row.namespace === 'NTE_ReferenceItem')
      .map((row) => [row.gameId.toLowerCase(), row]),
  );
  for (const row of rows.filter((row) =>
    ['NTE_ReferenceItem', 'NTE_ReferenceCurrency'].includes(row.namespace),
  )) {
    const id = aliases[row.gameId.toLowerCase()] || row.gameId.toLowerCase();
    const entry = byId[id];
    if (!entry) continue;
    const native =
      row.namespace === 'NTE_ReferenceCurrency'
        ? references.get(row.details.derivedFrom?.toLowerCase())
        : row;
    if (native?.details.rarity >= 1 && native.details.rarity <= 5)
      entry.rarity = native.details.rarity;
    const type =
      row.namespace === 'NTE_ReferenceCurrency'
        ? 'Валюта'
        : types.get(row.details.type_id);
    if (type) entry.type = type;
  }
  for (const [legacy, canonical] of [
    ['Пик Водяной Луны', 'Медиатор водяной луны'],
    ['Показушное платье с рукавами', 'Подол платья тщеславия'],
  ]) {
    const id = byName[normalize(canonical)];
    if (id) byName[normalize(legacy)] = id;
  }
  for (const id of Object.keys(byId)) if (!wanted.has(id)) delete byId[id];
  for (const key of Object.keys(byName))
    if (!wanted.has(byName[key])) delete byName[key];
  for (const key of Object.keys(aliases))
    if (!wanted.has(aliases[key])) delete aliases[key];
  await writeFile(
    'src/data/native-item-descriptions.json',
    JSON.stringify({ byId, byName, aliases }) + '\n',
  );
  console.log(
    JSON.stringify({
      ids: Object.keys(byId).length,
      names: Object.keys(byName).length,
      aliases: Object.keys(aliases).length,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const rows = gunzipSync(
    await readFile('scripts/content/game-data/chunks.jsonl.gz'),
  )
    .toString('utf8')
    .trim()
    .split('\n')
    .flatMap((line) => JSON.parse(line).records);
  await buildItemDescriptions(rows);
}
