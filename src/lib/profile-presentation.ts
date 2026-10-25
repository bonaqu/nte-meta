import index from '../data/native-profile-index.json' with { type: 'json' };
import type { CharacterAbility, CharacterMaterial } from '../types';

const key = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
const abilityOrders: Record<string, Record<string, number>> = index.abilities;
export function orderedAbilities(
  abilities: CharacterAbility[],
  ...names: string[]
) {
  const native = names.map((name) => abilityOrders[key(name)]).find(Boolean);
  const rank = (ability: CharacterAbility) => {
    const exact =
      native?.[key(ability.id.replace(/_name$/i, ''))] ??
      native?.[key(ability.name)];
    if (exact !== undefined) return exact;
    return /базов.*атак/i.test(ability.type)
      ? 0
      : /сверхспособ/i.test(ability.type)
        ? 2
        : /поддерж/i.test(ability.type)
          ? 3
          : /город|повседнев/i.test(ability.type)
            ? 20
            : /пассив|особенн|черт/i.test(ability.type)
              ? 10
              : 1;
  };
  return [...abilities].sort((a, b) => rank(a) - rank(b));
}

// Only sum the explicit quantity after ×; level numbers and descriptive digits
// are never costs. Unknown/interval/manual formats remain untouched.
export function totalMaterialAmount(value: string) {
  const parts = value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const counts = parts.map(
    (part) => part.match(/^(?:[^×]*:\s*)?×\s*(\d[\d\s\u00a0\u202f]*)$/u)?.[1],
  );
  if (!parts.length || counts.some((n) => !n)) return value;
  const total = counts.reduce(
    (sum, n) => sum + Number(n!.replace(/\s/gu, '')),
    0,
  );
  return Number.isSafeInteger(total)
    ? `×${total.toLocaleString('ru-RU')}`
    : value;
}
export function sumMaterialRows(rows: CharacterMaterial[]) {
  return rows.map((row) => ({
    ...row,
    amount: totalMaterialAmount(row.amount),
  }));
}
export function nativeEquipmentImage(
  name: string,
  kind: string,
  supplied = '',
) {
  // Explicit editor uploads and local/custom URLs stay authoritative. Only
  // replace absent images and the legacy source CDN URLs with native assets.
  if (
    supplied &&
    !/^https:\/\/(?:static\.nanoka\.cc|www\.kaiden\.gg)\//i.test(supplied)
  )
    return supplied;
  const matches = index.equipment.filter(
    (row) =>
      row.kind === kind &&
      row.names.some(
        (n) => key(n) === key(name.replace(/^(?:Дуга|Картридж):\s*/i, '')),
      ),
  );
  return matches.length === 1 ? matches[0].imageUrl : supplied;
}
