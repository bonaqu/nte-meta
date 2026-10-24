import { useState } from 'react';
import { ArrowRight, Orbit, UserRound } from 'lucide-react';
import { loadProgressionData } from '../lib/api';
import {
  calculateProgression,
  findProfileProgression,
  type ProgressionData,
} from '../lib/progression';
import { resolveAssetUrl } from '../lib/assets';

export function ProgressionCalculator({
  name,
  originalName,
  portraitUrl = '',
  appearanceId = '',
}: {
  name: string;
  originalName: string;
  portraitUrl?: string;
  appearanceId?: string;
}) {
  const [data, setData] = useState<ProgressionData | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [arcId, setArcId] = useState('');
  const [kind, setKind] = useState<'character' | 'arc'>('character');
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(80);
  const [ascended, setAscended] = useState(false);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [showOwned, setShowOwned] = useState(false);
  const [experienceItemId, setExperienceItemId] = useState('');
  const character =
    data && findProfileProgression(data, name, originalName, appearanceId);
  const arcs =
    data?.costs.filter(
      (row) =>
        row.kind === 'arc' &&
        !!character?.arcTypeId &&
        row.arcTypeId === character.arcTypeId,
    ) || [];
  const arc = arcs.find((row) => row.id === arcId) || arcs[0];
  const selected = kind === 'character' ? character : arc;
  const experienceItems =
    data?.experienceItems
      .filter((item) => item.kind === kind)
      .sort((a, b) => a.experience - b.experience) || [];
  const experienceItem =
    experienceItems.find((item) => item.id === experienceItemId) ||
    experienceItems.at(-1);
  let result;
  let validation = '';
  if (data && selected) {
    try {
      result = calculateProgression(
        data,
        selected,
        from,
        to,
        ascended,
        owned,
        experienceItem?.id,
      );
    } catch (reason) {
      validation = reason instanceof Error ? reason.message : '';
    }
  }
  async function load() {
    if (data || pending) return;
    setPending(true);
    setError('');
    const response = await loadProgressionData();
    setPending(false);
    if (response.ok) setData(response.data);
    else setError(response.error);
  }
  const changeKind = (next: 'character' | 'arc') => {
    setKind(next);
    setOwned({});
    setExperienceItemId('');
  };
  return (
    <details
      className="progression-calculator"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>Калькулятор прокачки персонажа и дуги</summary>
      {pending ? <p role="status">Загружаем таблицы прокачки…</p> : null}
      {error ? (
        <div>
          <p role="alert">{error}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => void load()}
            disabled={pending}
          >
            Повторить загрузку
          </button>
        </div>
      ) : null}
      {data ? (
        <div className="progression-workbench">
          <div
            className="progression-mode"
            role="group"
            aria-label="Что прокачиваем"
          >
            <button
              type="button"
              aria-pressed={kind === 'character'}
              onClick={() => changeKind('character')}
            >
              {portraitUrl ? (
                <img
                  src={resolveAssetUrl(portraitUrl)}
                  alt=""
                  width="52"
                  height="52"
                />
              ) : (
                <UserRound aria-hidden="true" />
              )}
              <span>
                <small>Персонаж</small>
                <strong>{name}</strong>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={kind === 'arc'}
              disabled={!arcs.length}
              onClick={() => changeKind('arc')}
            >
              {arc?.iconUrl ? (
                <img
                  src={resolveAssetUrl(arc.iconUrl)}
                  alt=""
                  width="52"
                  height="52"
                />
              ) : (
                <Orbit aria-hidden="true" />
              )}
              <span>
                <small>Дуга · {character?.arcType || 'тип не определён'}</small>
                <strong>{arc?.name || 'Нет совместимых дуг'}</strong>
              </span>
            </button>
          </div>
          {!character ? (
            <p role="status">Для {name} таблица прокачки пока недоступна.</p>
          ) : !arcs.length ? (
            <p role="status">
              Совместимость дуг для {name} пока не определена.
            </p>
          ) : null}
          {kind === 'arc' && arcs.length ? (
            <details className="arc-picker" key={appearanceId}>
              <summary>Выбрать дугу · {arc?.name}</summary>
              <label>
                Поиск совместимой дуги
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div
                className="arc-picker__options"
                role="group"
                aria-label={`Дуги типа ${character?.arcType}`}
              >
                {arcs
                  .filter((row) =>
                    `${row.name} ${row.originalName}`
                      .toLowerCase()
                      .includes(query.trim().toLowerCase()),
                  )
                  .map((row) => (
                    <button
                      type="button"
                      key={row.id}
                      aria-pressed={arc?.id === row.id}
                      onClick={() => {
                        setArcId(row.id);
                        setOwned({});
                      }}
                    >
                      {row.iconUrl ? (
                        <img
                          src={resolveAssetUrl(row.iconUrl)}
                          alt=""
                          width="64"
                          height="64"
                          loading="lazy"
                        />
                      ) : (
                        <Orbit aria-hidden="true" />
                      )}
                      <span>{row.name}</span>
                    </button>
                  ))}
              </div>
              {!arcs.some((row) =>
                `${row.name} ${row.originalName}`
                  .toLowerCase()
                  .includes(query.trim().toLowerCase()),
              ) ? (
                <p role="status">Дуга с таким названием не найдена.</p>
              ) : null}
            </details>
          ) : null}
          {selected ? (
            <>
              <div className="progression-levels">
                <label>
                  С уровня
                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={from}
                    onChange={(e) => setFrom(Number(e.target.value))}
                  />
                </label>
                <ArrowRight aria-hidden="true" />
                <label>
                  До уровня
                  <input
                    type="number"
                    min={1}
                    max={80}
                    value={to}
                    onChange={(e) => setTo(Number(e.target.value))}
                  />
                </label>
                <p className="progression-calculator__experience">
                  Опыт уровней
                  <strong>
                    {result?.experience.toLocaleString('ru-RU') || '—'}
                  </strong>
                </p>
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={ascended}
                  onChange={(e) => setAscended(e.target.checked)}
                />
                Возвышение на текущем уровне уже выполнено
              </label>
              <fieldset className="experience-picker">
                <legend>Предмет опыта</legend>
                <div>
                  {experienceItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-pressed={experienceItem?.id === item.id}
                      onClick={() => setExperienceItemId(item.id)}
                    >
                      {data.items[item.id]?.iconUrl ? (
                        <img
                          src={resolveAssetUrl(data.items[item.id].iconUrl)}
                          alt=""
                          width="64"
                          height="64"
                        />
                      ) : (
                        <Orbit aria-hidden="true" />
                      )}
                      <span>{data.items[item.id]?.name || item.id}</span>
                      <small>
                        +{item.experience.toLocaleString('ru-RU')} опыта
                      </small>
                    </button>
                  ))}
                </div>
              </fieldset>
              {validation ? <p role="alert">{validation}</p> : null}
              {result ? (
                <>
                  {result.missingLevels.length ? (
                    <p role="status">
                      Не хватает строк опыта для уровней:{' '}
                      {result.missingLevels.join(', ')}. Итог опыта неполный.
                    </p>
                  ) : null}
                  {result.missingAscension ? (
                    <p role="status">
                      Материалы возвышений не найдены. Сумма ниже неполная.
                    </p>
                  ) : null}
                  <div className="progression-result-heading">
                    <h3>Нужно для прокачки</h3>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={showOwned}
                        onChange={(e) => setShowOwned(e.target.checked)}
                      />
                      Учесть мой инвентарь
                    </label>
                  </div>
                  <div
                    className={`progression-calculator__materials${showOwned ? ' has-inventory' : ''}`}
                  >
                    {[
                      ...(result.experienceMaterial
                        ? [result.experienceMaterial]
                        : []),
                      ...result.materials,
                    ].map((item) => (
                      <article key={item.id}>
                        {item.iconUrl ? (
                          <img
                            src={resolveAssetUrl(item.iconUrl)}
                            width={52}
                            height={52}
                            alt=""
                          />
                        ) : (
                          <Orbit aria-hidden="true" />
                        )}
                        <div>
                          <strong>{item.name}</strong>
                          <p>
                            {'excess' in item
                              ? 'Опыт'
                              : item.id === 'gold'
                                ? 'Жук-монеты'
                                : 'Возвышение'}{' '}
                            · ×{item.amount.toLocaleString('ru-RU')}
                          </p>
                          {'excess' in item &&
                          typeof item.excess === 'number' &&
                          item.excess > 0 ? (
                            <small>
                              Остаток опыта:{' '}
                              {item.excess.toLocaleString('ru-RU')}
                            </small>
                          ) : null}
                        </div>
                        {showOwned ? (
                          <label>
                            <span>
                              Уже есть
                              <span className="sr-only">: {item.name}</span>
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={999999999}
                              value={owned[item.id] || 0}
                              onChange={(e) =>
                                setOwned({
                                  ...owned,
                                  [item.id]: Math.max(
                                    0,
                                    Number(e.target.value),
                                  ),
                                })
                              }
                            />
                          </label>
                        ) : null}
                        <output aria-label={`Нужно ещё: ${item.name}`}>
                          ×{item.needed.toLocaleString('ru-RU')}
                        </output>
                      </article>
                    ))}
                  </div>
                  {!result.experienceCurrencyKnown ? (
                    <p role="status">
                      Стоимость применения выбранных предметов опыта в
                      жук-монетах пока неизвестна и не включена в итог.
                    </p>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
