import { useEffect, useRef, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { CharacterMaterial } from '../types';
import { loadProgressionData } from '../lib/api';
import { displayItemName, resolveItemIcon } from '../lib/item-icons';

export function CharacterMaterials({
  materials,
  name,
  originalName,
}: {
  materials: CharacterMaterial[];
  name: string;
  originalName: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [ascension, setAscension] = useState<CharacterMaterial[] | null>(null);
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
      const key = (value: string) =>
        value
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]/gu, '')
          .replace(/^esperzero$/, 'zero');
      const option = response.data.costs.find(
        (row) =>
          row.kind === 'character' &&
          [name, originalName].some((value) =>
            [row.name, row.originalName].some(
              (other) => key(value) === key(other),
            ),
          ),
      );
      if (!option?.stages.length) return;
      const totals = new Map<string, { total: number; levels: string[] }>();
      for (const stage of option.stages) {
        const entries: Array<[string, number]> = stage.items_id.map(
          (id, index) => [id, stage.amount[index]],
        );
        if (stage.cost_gold) entries.push(['gold', stage.cost_gold]);
        for (const [id, amount] of entries) {
          const row = totals.get(id) || { total: 0, levels: [] };
          row.total += Number(amount) || 0;
          row.levels.push(
            `${stage.fromLevel ?? Number(stage.level) - 10} → ${stage.level}: ${Number(amount).toLocaleString('ru-RU')}`,
          );
          totals.set(id, row);
        }
      }
      setAscension(
        [...totals].map(([id, row]) => ({
          id,
          name: response.data.items[id]?.name || id,
          iconUrl: response.data.items[id]?.iconUrl || '',
          amount: `×${row.total.toLocaleString('ru-RU')}`,
          source: row.levels.join(' · '),
        })),
      );
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
  for (const [title, rows] of buckets) groups.push({ title, rows });
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
          <h3>{title}</h3>
          <div className="material-grid">
            {rows.map((row) => (
              <article key={row.id}>
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
                  <strong>{row.amount}</strong>
                  <p>{row.source}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
