import type { CharacterStat } from '../types';
import { resolveStatIcon } from '../lib/native-icons';
import { statNativeId } from '../lib/stat-identity';

const initialOrder = [
  'HPMaxBase',
  'AtkBase',
  'DefBase',
  'StrengthMax',
  'CritBase',
  'CritDamageBase',
  'ChargeGetEfficiencyBase',
  'Mag',
  'MagBase',
  'UnbalIntensity',
  'UnbalIntensityBase',
  'HealUp',
  'HealBeUp',
];
const nativeLabels: Record<string, string> = {
  HPMaxBase: 'ОЗ',
  AtkBase: 'Атака',
  DefBase: 'Защита',
  CritBase: 'Шанс крит. удара',
  CritDamageBase: 'Крит. урон',
};
const damageOrder = [
  'General',
  'Cosmos',
  'Nature',
  'Incantation',
  'Chaos',
  'Psyche',
  'Lakshana',
  'Psychically',
];
function damageSort(a: CharacterStat, b: CharacterStat) {
  const order = (stat: CharacterStat) =>
    damageOrder.findIndex((element) =>
      new RegExp(`^Damage(?:Up|Resist)${element}(?:Base)?$`).test(
        statNativeId(stat),
      ),
    );
  return order(a) - order(b);
}
function label(stat: CharacterStat) {
  const id = statNativeId(stat);
  return nativeLabels[id] &&
    /^(?:ОЗ|Здоровье|АТК|Атака|ЗАЩ|Защита|Шанс крит\..*|Крит\. урон|Урон крит\.)$/i.test(
      stat.label,
    )
    ? nativeLabels[id]
    : stat.label;
}
function StatRows({ stats }: { stats: CharacterStat[] }) {
  return (
    <dl className="character-stat-grid">
      {stats.map((stat) => (
        <div key={stat.id}>
          <dt>
            <img
              className="native-stat-icon"
              src={resolveStatIcon(stat.label, statNativeId(stat))}
              alt=""
              width="30"
              height="30"
              loading="lazy"
            />
            <span>{label(stat)}</span>
          </dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
export function CharacterStats({ stats }: { stats: CharacterStat[] }) {
  if (!stats.length) return null;
  const primary = stats.filter(
    (stat) => !/^Damage(?:Up|Resist)/.test(statNativeId(stat)),
  );
  const bonuses = stats
    .filter((stat) => /^DamageUp/.test(statNativeId(stat)))
    .sort(damageSort);
  const resistances = stats
    .filter((stat) => /^DamageResist/.test(statNativeId(stat)))
    .sort(damageSort);
  const ordered = [...primary].sort((a, b) => {
    const ai = initialOrder.indexOf(statNativeId(a)),
      bi = initialOrder.indexOf(statNativeId(b));
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return (
    <section
      className="character-initial-stats"
      aria-label="Начальные показатели · уровень 1"
    >
      <h3>
        Начальные показатели <span>Ур. 1</span>
      </h3>
      <StatRows stats={ordered} />
      {bonuses.length || resistances.length ? (
        <details className="character-stat-details">
          <summary>Бонусы урона и сопротивления</summary>
          {bonuses.length ? (
            <section aria-label="Бонусы урона">
              <h4>Бонусы урона</h4>
              <StatRows stats={bonuses} />
            </section>
          ) : null}
          {resistances.length ? (
            <section aria-label="Сопротивления">
              <h4>Сопротивления</h4>
              <StatRows stats={resistances} />
            </section>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
