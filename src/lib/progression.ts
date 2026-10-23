export interface ProgressionStage {
  level: string;
  items_id: string[];
  amount: number[];
  cost_gold?: number;
}
export interface ProgressionOption {
  id: string;
  kind: 'character' | 'arc';
  name: string;
  originalName: string;
  rarity?: number;
  stages: ProgressionStage[];
}
export interface ProgressionData {
  costs: ProgressionOption[];
  items: Record<string, { name: string; iconUrl: string }>;
  characterExp: Array<{ level: number; exp: number }>;
  arcExp: Array<{ key: string; exp: number }>;
  experienceItems: Array<{
    id: string;
    kind: 'character' | 'arc';
    experience: number;
  }>;
}
export function calculateProgression(
  data: ProgressionData,
  option: ProgressionOption,
  from: number,
  to: number,
  ascended: boolean,
  owned: Record<string, number> = {},
  experienceItemId = '',
) {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 1 ||
    to > 80 ||
    to < from
  )
    throw new Error(
      'Выберите уровни от 1 до 80; целевой уровень должен быть не меньше текущего.',
    );
  const totals = new Map<string, number>();
  const sum = (id: string, amount: number) =>
    totals.set(id, (totals.get(id) || 0) + amount);
  for (const stage of option.stages) {
    const level = Number(stage.level);
    if (level < from || level >= to || (level === from && ascended)) continue;
    for (let i = 0; i < stage.items_id.length; i++)
      sum(stage.items_id[i], Number(stage.amount[i]) || 0);
    if (stage.cost_gold) sum('gold', stage.cost_gold);
  }
  let experience = 0;
  const missingLevels: number[] = [];
  for (let level = from; level < to; level++) {
    const row =
      option.kind === 'character'
        ? data.characterExp.find((r) => r.level === level)
        : data.arcExp.find(
            (r) =>
              r.key === `upgrade_pack_Fork_rank${option.rarity}_1_${level + 1}`,
          );
    if (row && Number.isFinite(row.exp)) experience += row.exp;
    else missingLevels.push(level);
  }
  const experienceItem = data.experienceItems.find(
    (item) => item.kind === option.kind && item.id === experienceItemId,
  );
  const experienceMaterial = experienceItem
    ? {
        id: experienceItem.id,
        name: data.items[experienceItem.id]?.name || experienceItem.id,
        iconUrl: data.items[experienceItem.id]?.iconUrl || '',
        amount: Math.ceil(experience / experienceItem.experience),
        needed: Math.max(
          0,
          Math.ceil(experience / experienceItem.experience) -
            Math.max(0, owned[experienceItem.id] || 0),
        ),
        excess:
          Math.ceil(experience / experienceItem.experience) *
            experienceItem.experience -
          experience,
      }
    : undefined;
  return {
    experience,
    experienceMaterial,
    missingLevels,
    materials: [...totals].map(([id, amount]) => ({
      id,
      name: data.items[id]?.name || id,
      iconUrl: data.items[id]?.iconUrl || '',
      amount,
      needed: Math.max(0, amount - Math.max(0, owned[id] || 0)),
    })),
  };
}
