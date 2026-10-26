import { useState } from 'react';
import { ImageIcon, Swords, Coffee, Sparkles } from 'lucide-react';
import type { CharacterAbility } from '../types';
import {
  calculateSkillProgression,
  type ProgressionData,
  type SkillProgression,
} from '../lib/progression';
import { orderedAbilities } from '../lib/profile-presentation';
import { ItemDetails } from './item-details';
import { QuantityControl } from './quantity-control';
import { resolveAssetUrl } from '../lib/assets';

const labels: Record<string, string> = {
  melee: 'Базовая атака',
  skill: 'Навык',
  ultraskill: 'Сверхспособность',
  qte: 'Навык поддержки',
  passive: 'Пассивный навык',
  city: 'Повседневный навык',
};
const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/_name$/i, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

export function SkillMaterials({
  data,
  skills,
  abilities,
  name,
  originalName,
}: {
  data: ProgressionData;
  skills: SkillProgression[];
  abilities: CharacterAbility[];
  name: string;
  originalName: string;
}) {
  const kind = skills[0].kind;
  const min = kind === 'combat' ? 1 : 0;
  const cap = (rows: SkillProgression[]) =>
    Math.max(
      ...rows.flatMap((skill) =>
        skill.stages.map((stage) => Number(stage.level)),
      ),
    );
  const [selected, setSelected] = useState('all');
  const [from, setFrom] = useState(min);
  const [to, setTo] = useState(() => cap(skills));
  const active =
    selected === 'all'
      ? skills
      : skills.filter((skill) => skill.id === selected);
  const max = cap(active);
  const select = (id: string) => {
    setSelected(id);
    setFrom(min);
    setTo(
      cap(id === 'all' ? skills : skills.filter((skill) => skill.id === id)),
    );
  };
  const result = calculateSkillProgression(data, active, from, to);
  const sorted = orderedAbilities(abilities, name, originalName);
  const details = (skill: SkillProgression) => {
    const exact = abilities.find(
      (ability) => normalize(ability.id) === normalize(skill.id),
    );
    if (exact) return exact;
    const type = labels[skill.type] || '';
    const candidates = sorted.filter((ability) => ability.type === type);
    const at = skills
      .filter((entry) => entry.type === skill.type)
      .findIndex((entry) => entry.id === skill.id);
    return candidates[at];
  };
  const title =
    kind === 'combat'
      ? 'Прокачка боевых навыков'
      : kind === 'city'
        ? 'Повседневные навыки'
        : 'Пассивные навыки';
  return (
    <section className="profile-subsection skill-materials" aria-label={title}>
      <h3 className="profile-subsection__title">
        <span aria-hidden="true">
          {kind === 'combat' ? (
            <Swords />
          ) : kind === 'city' ? (
            <Coffee />
          ) : (
            <Sparkles />
          )}
        </span>
        {title}
      </h3>
      <div
        className="skill-cost-picker"
        role="group"
        aria-label={`Выбор: ${title}`}
      >
        <button
          type="button"
          aria-pressed={selected === 'all'}
          onClick={() => select('all')}
        >
          <span className="skill-cost-picker__icon" aria-hidden="true">
            {kind === 'combat' ? <Swords /> : <Sparkles />}
          </span>
          <span>
            Все{' '}
            {kind === 'combat'
              ? 'боевые навыки'
              : kind === 'city'
                ? 'повседневные навыки'
                : 'пассивные навыки'}
          </span>
        </button>
        {skills.map((skill) => {
          const ability = details(skill);
          return (
            <button
              type="button"
              key={skill.id}
              aria-pressed={selected === skill.id}
              onClick={() => select(skill.id)}
            >
              <span className="skill-cost-picker__icon">
                {ability?.iconUrl ? (
                  <img
                    src={resolveAssetUrl(ability.iconUrl)}
                    alt=""
                    width="40"
                    height="40"
                    loading="lazy"
                  />
                ) : (
                  <Sparkles aria-hidden="true" />
                )}
              </span>
              <span>
                {ability?.name ? (
                  <small>{labels[skill.type] || title}</small>
                ) : null}
                {ability?.name || labels[skill.type] || title}
              </span>
            </button>
          );
        })}
      </div>
      <div className="skill-cost-range">
        <QuantityControl
          label="Текущий уровень навыка"
          value={from}
          min={min}
          max={max}
          onChange={(value) => {
            setFrom(value);
            setTo(Math.max(to, value));
          }}
        />
        <QuantityControl
          label="Целевой уровень навыка"
          value={to}
          min={from}
          max={max}
          onChange={setTo}
        />
      </div>
      <p className="profile-range-note" role="status">
        {kind === 'support'
          ? 'Открытие пассивных навыков'
          : `Уровни ${from} → ${to}`}{' '}
        · {active.length === 1 ? 'один навык' : `${active.length} навыка`}
      </p>
      {result.missing.length ? (
        <p role="alert">
          В справочнике не хватает стоимости для выбранных уровней. Итог не
          рассчитан.
        </p>
      ) : result.materials.some((item) => !item.name) ? (
        <p role="alert">
          Названия некоторых материалов ещё не загружены. Повторите загрузку
          справочника.
        </p>
      ) : result.materials.length ? (
        <div className="material-grid inventory-tiles">
          {result.materials.map((item) => (
            <article className="game-item" key={item.id}>
              <ItemDetails
                id={item.id}
                name={item.name}
                iconUrl={item.iconUrl}
                context={title}
              />
              {item.iconUrl ? (
                <img
                  src={resolveAssetUrl(item.iconUrl)}
                  alt=""
                  width="54"
                  height="54"
                  loading="lazy"
                />
              ) : (
                <span className="character-detail-fallback-icon">
                  <ImageIcon aria-hidden="true" />
                </span>
              )}
              <div className="character-detail-card-copy">
                <h4>{item.name}</h4>
                <strong>×{item.amount.toLocaleString('ru-RU')}</strong>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p role="status">Уровни совпадают — материалы не требуются.</p>
      )}
    </section>
  );
}
