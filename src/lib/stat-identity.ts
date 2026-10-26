// Match legacy editor labels to the same starting attribute without adding a duplicate.
export function statIdentity(stat: { label: string }) {
  const key = stat.label.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]/gu, '');
  if (/^(?:hp|health|оз|здоровье)$/.test(key)) return 'health';
  if (/^(?:atk|attack|атака|атк)$/.test(key)) return 'attack';
  if (/^(?:def|defense|defence|защита|защ)$/.test(key)) return 'defense';
  if (key.startsWith('шанскрит')) return 'crit';
  if (key.includes('крит')) return 'critDamage';
  if (/^(?:усилениеурона|бонусурона|бонускурону)$/.test(key)) return 'damage';
  return key;
}

export function statNativeId(stat: { id: string; label: string }) {
  const known: Record<string, string> = {
    health: 'HPMaxBase',
    attack: 'AtkBase',
    defense: 'DefBase',
    crit: 'CritBase',
    critDamage: 'CritDamageBase',
    damage: 'DamageUpGeneralBase',
  };
  return known[statIdentity(stat)] || stat.id;
}
