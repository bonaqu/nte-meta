// Compact Russian equipment sheets from the same normalized native snapshot.
export function equipmentDescriptions(rows) {
  const key = (value) => String(value || '').toLowerCase();
  const text = new Map(
    rows
      .filter((row) => row.values.ru)
      .map((row) => [row.namespace + ':' + key(row.gameId), row.values.ru]),
  );
  const clean = (value) =>
    String(value || '')
      .replace(/<cf>/g, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\\+n/g, '\n')
      .trim();
  const localized = (ref) =>
    text.get(
      String(ref?.TableId || '')
        .split('.')
        .at(-1) +
        ':' +
        key(ref?.Key),
    ) || '';
  const types = {
    solid: 'Твёрдый',
    liquid: 'Жидкий',
    gas: 'Газовый',
    plasma: 'Плазменный',
    condensate: 'Гибридный',
    hybrid: 'Гибридный',
    cluster: 'Гибридный',
  };
  const statNames = {
    AtkBase: 'Атака',
    AtkUp: 'Атака',
    HPMaxBase: 'ОЗ',
    HPMaxUp: 'ОЗ',
    DefBase: 'Защита',
    DefUp: 'Защита',
    CritBase: 'Шанс крит. удара',
    CritDamageBase: 'Крит. урон',
  };
  return rows
    .filter(
      (row) =>
        ['NTE_ReferenceWeapon', 'DT_EquipmentSuitData'].includes(
          row.namespace,
        ) && row.values.ru,
    )
    .map((row) => {
      const arc = row.namespace === 'NTE_ReferenceWeapon';
      const stem = key(row.gameId);
      const fields = rows.filter(
        (record) =>
          record.namespace === 'ST_Fork' && key(record.gameId).includes(stem),
      );
      const resolveEffect = (value) =>
        clean(value).replace(
          /\{(\d+)\}/g,
          (original, id) =>
            row.details.effect?.values?.find(
              (entry) => entry.id_value === Number(id),
            )?.values?.[0] ?? original,
        );
      const effect = arc
        ? fields
            .filter((record) => /_effect$/i.test(record.gameId))
            .map((record) => resolveEffect(record.values.ru))
            .filter((value) => value && !/\{\d+\}/.test(value))
            .join('\n')
        : '';
      const description = arc
        ? fields
            .filter((record) => /_(?:des|desc|context)$/i.test(record.gameId))
            .map((record) => clean(record.values.ru))
            .filter(Boolean)
            .filter((value, index, array) => array.indexOf(value) === index)
            .join('\n')
        : clean(localized(row.details.SuitDescription));
      const stats = arc
        ? (row.details.stats || [])
            .filter((stat) => stat.values?.length)
            .map((stat) => ({
              label: `${statNames[stat.id_stats] || stat.name} · ур. ${stat.values.length}`,
              value: `${stat.values.at(-1)}${stat.b_is_percent ? '%' : ''}`,
            }))
        : (row.details.SuitStructList || [])
            .map((suit) => ({
              label: `${suit.SuitCondition} предмета`,
              value: clean(localized(suit.SuitBuffDescription)),
            }))
            .filter((stat) => stat.value);
      return {
        id: stem,
        names: Object.values(row.values).filter(Boolean),
        detail: {
          name: row.values.ru,
          type: arc ? 'Дуга' : 'Картридж',
          rarity: row.details.rarity,
          iconUrl:
            row.assets.find((asset) =>
              asset.url?.startsWith('/nte-meta/game-assets/'),
            )?.url || '',
          usage: arc
            ? [types[key(row.details.type_name)], effect ? 'Смешивание I' : '']
                .filter(Boolean)
                .join(' · ')
            : '',
          description: [effect, description].filter(Boolean).join('\n\n'),
          stats,
        },
      };
    });
}
