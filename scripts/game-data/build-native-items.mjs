import { writeFile } from 'node:fs/promises';

export async function buildNativeItems(rows) {
  const foodKey = (value) =>
    /^food_\d+$/i.test(value)
      ? `food_${Number(value.split('_')[1])}`
      : value.toLowerCase();
  const images = new Map();
  for (const row of rows.filter((row) => row.kind === 'image')) {
    const key = foodKey(row.gameId);
    for (const asset of row.assets || []) {
      const previous = images.get(key);
      if (
        !previous ||
        asset.width * asset.height > previous.width * previous.height
      )
        images.set(key, asset);
    }
  }
  const items = {};
  for (const row of rows.filter(
    (row) =>
      ['ST_Item', 'ST_food'].includes(row.namespace) &&
      /_name$/i.test(row.gameId) &&
      row.values.ru &&
      /^food_\d+_name$/i.test(row.gameId),
  )) {
    const id = row.gameId.replace(/_name$/i, '').toLowerCase();
    const icon =
      images.get(foodKey(id)) || images.get(id.replace(/^item_/, ''));
    const item = { name: row.values.ru, iconUrl: icon?.url || '' };
    items[id] = item;
    if (/^food_\d+$/.test(id)) {
      const number = String(Number(id.split('_')[1]));
      for (const length of [0, 3, 4])
        items[`food_${number.padStart(length, '0')}`] = item;
    }
  }
  await writeFile('src/data/native-items.json', JSON.stringify(items) + '\n');
  console.log(JSON.stringify({ nativeItems: Object.keys(items).length }));
  return items;
}
