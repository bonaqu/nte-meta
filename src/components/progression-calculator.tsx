import { lazy, Suspense, useId, useRef, useState } from 'react';
import {
  ArrowRight,
  Calculator,
  ChevronDown,
  Orbit,
  UserRound,
} from 'lucide-react';
import { loadProgressionData } from '../lib/api';
import {
  calculateProgression,
  findProfileProgression,
  type ProgressionData,
} from '../lib/progression';
import { resolveAssetUrl } from '../lib/assets';
import { QuantityControl } from './quantity-control';
const ItemDetails = lazy(() =>
  import('./item-details').then((module) => ({ default: module.ItemDetails })),
);

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
  const [arcPickerOpen, setArcPickerOpen] = useState(false);
  const pickerId = useId();
  const arcToggle = useRef<HTMLButtonElement>(null);
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
        showOwned ? owned : {},
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
    if (next === 'character') setArcPickerOpen(false);
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
      <summary>
        <Calculator aria-hidden="true" />
        <span>Калькулятор прокачки персонажа и дуги</span>
        <ChevronDown aria-hidden="true" />
      </summary>
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
            <div
              className={`progression-arc-control${kind === 'arc' ? ' active' : ''}`}
            >
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
                  <small>
                    Дуга · {character?.arcType || 'тип не определён'}
                  </small>
                  <strong>{arc?.name || 'Нет совместимых дуг'}</strong>
                </span>
              </button>
              {arc ? (
                <Suspense fallback={null}>
                  <ItemDetails
                    id={arc.id}
                    name={arc.name}
                    iconUrl={arc.iconUrl || ''}
                    context="Дуга"
                    iconOnly
                    hoverParent
                  />
                </Suspense>
              ) : null}
              <button
                ref={arcToggle}
                type="button"
                className="progression-arc-toggle"
                aria-label="Выбрать дугу"
                aria-expanded={arcPickerOpen}
                aria-controls={arcPickerOpen ? pickerId : undefined}
                disabled={!arcs.length}
                onClick={() => {
                  if (kind !== 'arc') changeKind('arc');
                  setArcPickerOpen((value) => !value);
                }}
              >
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
          </div>
          {!character ? (
            <p role="status">Для {name} таблица прокачки пока недоступна.</p>
          ) : !arcs.length ? (
            <p role="status">
              Совместимость дуг для {name} пока не определена.
            </p>
          ) : null}
          {kind === 'arc' && arcs.length && arcPickerOpen ? (
            <div
              className="arc-picker"
              id={pickerId}
              role="region"
              aria-label="Доступные дуги"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setArcPickerOpen(false);
                  arcToggle.current?.focus();
                }
              }}
            >
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
                    <div className="arc-picker-option" key={row.id}>
                      <button
                        type="button"
                        aria-pressed={arc?.id === row.id}
                        onClick={() => {
                          setArcId(row.id);
                          setOwned({});
                          setArcPickerOpen(false);
                          arcToggle.current?.focus();
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

                      <Suspense fallback={null}>
                        <ItemDetails
                          id={row.id}
                          name={row.name}
                          iconUrl={row.iconUrl || ''}
                          context="Дуга"
                          iconOnly
                          hoverParent
                        />
                      </Suspense>
                    </div>
                  ))}
              </div>
              {!arcs.some((row) =>
                `${row.name} ${row.originalName}`
                  .toLowerCase()
                  .includes(query.trim().toLowerCase()),
              ) ? (
                <p role="status">Дуга с таким названием не найдена.</p>
              ) : null}
            </div>
          ) : null}
          {selected ? (
            <>
              <div className="progression-inputs">
                <div className="progression-levels">
                  <QuantityControl
                    label="С уровня"
                    min={1}
                    max={80}
                    value={from}
                    onChange={setFrom}
                  />
                  <ArrowRight aria-hidden="true" />
                  <QuantityControl
                    label="До уровня"
                    min={1}
                    max={80}
                    value={to}
                    onChange={setTo}
                  />
                  <p className="progression-calculator__experience">
                    Опыт уровней
                    <strong>
                      {result?.experience.toLocaleString('ru-RU') || '—'}
                    </strong>
                  </p>
                </div>
                <div
                  className="progression-presets"
                  role="group"
                  aria-label="Диапазон уровней"
                >
                  {[
                    [1, 20],
                    [20, 40],
                    [40, 60],
                    [60, 80],
                    [1, 80],
                  ].map(([start, end]) => (
                    <button
                      type="button"
                      key={`${start}-${end}`}
                      aria-pressed={from === start && to === end}
                      onClick={() => {
                        setFrom(start);
                        setTo(end);
                      }}
                    >
                      {start} → {end}
                    </button>
                  ))}
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
              </div>
              {result ? (
                <section
                  className="progression-total"
                  aria-label="Результат расчёта"
                >
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
                        <Suspense fallback={null}>
                          <ItemDetails
                            id={item.id}
                            name={item.name}
                            iconUrl={item.iconUrl}
                            context="Материал развития"
                            quantity={item.amount.toLocaleString('ru-RU')}
                            iconOnly
                          />
                        </Suspense>

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
                            {showOwned
                              ? ` · Всего ×${item.amount.toLocaleString('ru-RU')}`
                              : ''}
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
                          <QuantityControl
                            label={`Уже есть: ${item.name}`}
                            min={0}
                            sliderMax={item.amount}
                            value={owned[item.id] || 0}
                            onChange={(amount) =>
                              setOwned({ ...owned, [item.id]: amount })
                            }
                          />
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
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
