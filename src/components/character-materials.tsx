import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeftRight, ImageIcon, Swords, TrendingUp } from 'lucide-react';
import type { CharacterMaterial } from '../types';
import { loadProgressionData } from '../lib/api';
import {
  findProfileProgression,
  calculateProgression,
  type ProgressionData,
  type ProgressionOption,
} from '../lib/progression';
import { displayItemName, resolveItemIcon } from '../lib/item-icons';
import { ItemDetails } from './item-details';

export function CharacterMaterials({
  materials,
  name,
  originalName,
  onLayout,
}: {
  materials: CharacterMaterial[];
  name: string;
  originalName: string;
  onLayout?: () => void;
}) {
  // Align after React changes the loading/result block, before it is painted.
  useLayoutEffect(() => {
    onLayout?.();
  });
  const root = useRef<HTMLDivElement>(null);
  const [native, setNative] = useState<{
    data: ProgressionData;
    option: ProgressionOption;
  } | null>(null);
  const [stageId, setStageId] = useState('all');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setPending(true);
      const response = await loadProgressionData();
      if (cancelled) return;
      setPending(false);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      const option = findProfileProgression(response.data, name, originalName);
      if (option?.stages.length) setNative({ data: response.data, option });
      setError('');
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: '300px' },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [name, originalName, attempt]);
  const stages = native?.option.stages || [];
  const selectedStage = stages.find((stage) => stage.level === stageId);
  const totals = new Map<string, number>();
  for (const stage of selectedStage ? [selectedStage] : stages) {
    stage.items_id.forEach((id, index) =>
      totals.set(
        id,
        (totals.get(id) || 0) + (Number(stage.amount[index]) || 0),
      ),
    );
    if (stage.cost_gold)
      totals.set('gold', (totals.get('gold') || 0) + stage.cost_gold);
  }
  const initialLevels =
    native && stageId === 'initial'
      ? calculateProgression(
          native.data,
          native.option,
          1,
          20,
          false,
          {},
          native.data.experienceItems
            .filter((item) => item.kind === 'character')
            .sort((a, b) => b.experience - a.experience)[0]?.id,
        )
      : null;
  const ascension = initialLevels
    ? [
        ...(initialLevels.experienceMaterial
          ? [initialLevels.experienceMaterial]
          : []),
        ...initialLevels.materials,
      ].map((item) => ({
        id: item.id,
        name: item.name,
        iconUrl: item.iconUrl,
        amount: `×${item.amount.toLocaleString('ru-RU')}`,
        source: '',
      }))
    : native
      ? [...totals].map(([id, amount]) => ({
          id,
          name: native.data.items[id]?.name || id,
          iconUrl: native.data.items[id]?.iconUrl || '',
          amount: `×${amount.toLocaleString('ru-RU')}`,
          source: '',
        }))
      : null;
  const groups: Array<{ title: string; rows: CharacterMaterial[] }> = [];
  if (ascension)
    groups.push({ title: 'Возвышение персонажа', rows: ascension });
  const buckets = new Map<string, CharacterMaterial[]>();
  for (const row of materials) {
    const source = row.source.toLowerCase();
    if (
      ascension &&
      /^(?:материалы прорыва|уровень возвышения → количество:.*)$/.test(source)
    )
      continue;
    const title = /дуг|оруж/.test(source)
      ? 'Прокачка дуг'
      : /поддерж/.test(source)
        ? 'Навыки поддержки'
        : /навык|способност/.test(source)
          ? 'Прокачка боевых навыков'
          : /прорыв|возвыш/.test(source)
            ? 'Возвышение персонажа'
            : 'Другие материалы прокачки';
    buckets.set(title, [...(buckets.get(title) || []), row]);
  }
  for (const [title, rows] of buckets) {
    const existing = groups.find((group) => group.title === title);
    if (existing) existing.rows.push(...rows);
    else groups.push({ title, rows });
  }
  return (
    <div ref={root} className="character-material-groups">
      {pending ? <p role="status">Загружаем материалы возвышения…</p> : null}
      {error ? (
        <div className="inline-load-error">
          <p role="alert">{error}</p>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Повторить загрузку материалов
          </button>
        </div>
      ) : null}
      {groups.map(({ title, rows }) => (
        <section className="profile-subsection" key={title} aria-label={title}>
          <h3 className="profile-subsection__title">
            <span aria-hidden="true">
              {title === 'Возвышение персонажа' ? (
                <TrendingUp />
              ) : title === 'Навыки поддержки' ? (
                <ArrowLeftRight />
              ) : (
                <Swords />
              )}
            </span>
            {title}
          </h3>
          {title === 'Возвышение персонажа' && stages.length ? (
            <div
              className="ascension-stages"
              role="group"
              aria-label="Этап возвышения"
            >
              <button
                type="button"
                aria-pressed={stageId === 'initial'}
                onClick={() => setStageId('initial')}
              >
                1 → 20
              </button>
              <button
                type="button"
                aria-pressed={stageId === 'all'}
                onClick={() => setStageId('all')}
              >
                Всего · 1–80
              </button>
              {stages.map((stage) => (
                <button
                  type="button"
                  key={stage.level}
                  aria-pressed={stageId === stage.level}
                  onClick={() => setStageId(stage.level)}
                >
                  {stage.fromLevel ?? Number(stage.level) - 10} → {stage.level}
                </button>
              ))}
            </div>
          ) : null}
          {title === 'Возвышение персонажа' && stageId === 'initial' ? (
            <p className="profile-range-note">
              Уровни 1–20: набор опыта. Первое возвышение — после 20-го уровня.
            </p>
          ) : null}
          {initialLevels?.missingLevels.length &&
          title === 'Возвышение персонажа' ? (
            <p role="status">
              В таблице не хватает данных опыта для этого диапазона.
            </p>
          ) : null}
          <div className="material-grid inventory-tiles">
            {rows.map((row) => (
              <article className="game-item" key={row.id}>
                <ItemDetails
                  id={row.id}
                  name={displayItemName(row.name)}
                  iconUrl={row.iconUrl}
                  context={title}
                />
                {resolveItemIcon(row.name, row.iconUrl) ? (
                  <img
                    src={resolveItemIcon(row.name, row.iconUrl)}
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
                  <h4>{displayItemName(row.name)}</h4>
                  <div className="material-costs">
                    {row.amount
                      .split(';')
                      .filter(Boolean)
                      .map((cost, index) => (
                        <strong key={index}>
                          {cost
                            .trim()
                            .replace(
                              /^Материалы навыков(?: поддержки)?:\s*/i,
                              '',
                            )}
                        </strong>
                      ))}
                  </div>
                  {row.source &&
                  !/^Материалы (?:навыков|поддержки|прорыва)/i.test(
                    row.source,
                  ) ? (
                    <p>{row.source}</p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
