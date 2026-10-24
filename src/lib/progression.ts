export interface ProgressionStage {
  level: string;
  fromLevel?: number;
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
  arcTypeId?: number;
  arcType?: string;
  iconUrl?: string;
  stages: ProgressionStage[];
}
export function findProfileProgression(
  data: ProgressionData,
  name: string,
  originalName: string,
  appearanceId = '',
) {
  const key = (text: string) =>
    text
      .replace(/\([^)]*\)/g, '')
      .replace(/[^\p{L}\p{N}]/gu, '')
      .toLowerCase()
      .replace(/^esperzero$/, 'zero');
  return (
    data.costs.find(
      (row) => row.kind === 'character' && row.id === appearanceId,
    ) ||
    data.costs.find(
      (row) =>
        row.kind === 'character' &&
        [name, originalName].some(
          (n) =>
            Boolean(key(n)) &&
            [row.name, row.originalName].some((v) => key(v) === key(n)),
        ),
    )
  );
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
    currencyCost?: number;
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
  const stages = [...option.stages].sort(
    (a, b) => Number(a.level) - Number(b.level),
  );
  for (const [index, stage] of stages.entries()) {
    const level =
      stage.fromLevel ?? (index ? Number(stages[index - 1].level) : 20);
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
  const experienceCurrencyKnown =
    experience === 0 ||
    !!(experienceItem && Number.isFinite(experienceItem.currencyCost));
  if (
    experienceMaterial &&
    experienceCurrencyKnown &&
    experienceItem?.currencyCost
  )
    sum('gold', experienceMaterial.amount * experienceItem.currencyCost);
  return {
    experience,
    experienceMaterial,
    missingLevels,
    experienceCurrencyKnown,
    missingAscension:
      !stages.length &&
      from < to &&
      [20, 30, 40, 50, 60, 70].some((level) => from <= level && to > level),
    materials: [...totals].map(([id, amount]) => ({
      id,
      name: data.items[id]?.name || id,
      iconUrl: data.items[id]?.iconUrl || '',
      amount,
      needed: Math.max(0, amount - Math.max(0, owned[id] || 0)),
    })),
  };
}
