import { useState } from 'react';
import { loadProgressionData } from '../lib/api';
import { calculateProgression, type ProgressionData } from '../lib/progression';
import { resolveAssetUrl } from '../lib/assets';

export function ProgressionCalculator({
  name,
  originalName,
}: {
  name: string;
  originalName: string;
}) {
  const [data, setData] = useState<ProgressionData | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [id, setId] = useState('');
  const [kind, setKind] = useState<'character' | 'arc'>('character');
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(80);
  const [ascended, setAscended] = useState(false);
  const [owned, setOwned] = useState<Record<string, number>>({});
  const [experienceItemId, setExperienceItemId] = useState('');
  const selected = data?.costs.find(
    (row) => row.kind === kind && row.id === id,
  );
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
        experienceItemId ||
          data.experienceItems.find((item) => item.kind === kind)?.id,
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
    if (response.ok) {
      setData(response.data);
      const key = (text: string) =>
        text
          .replace(/[^\p{L}\p{N}]/gu, '')
          .toLowerCase()
          .replace(/^esperzero$/, 'zero');
      const option = response.data.costs.find(
        (row) =>
          row.kind === 'character' &&
          [name, originalName].some((n) =>
            [row.name, row.originalName].some((v) => key(v) === key(n)),
          ),
      );
      setId(option?.id || '');
    } else setError(response.error);
  }
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
        <>
          <div className="form-grid">
            <label>
              Что прокачиваем
              <select
                value={kind}
                onChange={(event) => {
                  const kind = event.target.value as 'character' | 'arc';
                  setKind(kind);
                  setId(data.costs.find((row) => row.kind === kind)?.id || '');
                  setOwned({});
                  setExperienceItemId('');
                }}
              >
                <option value="character">Персонаж</option>
                <option value="arc">Дуга</option>
              </select>
            </label>
            <label>
              Предмет опыта
              <select
                value={
                  experienceItemId ||
                  data.experienceItems.find((item) => item.kind === kind)?.id ||
                  ''
                }
                onChange={(event) => setExperienceItemId(event.target.value)}
              >
                {data.experienceItems
                  .filter((item) => item.kind === kind)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {data.items[item.id]?.name || item.id} ·{' '}
                      {item.experience.toLocaleString('ru-RU')} опыта
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Персонаж или дуга
              <select
                value={id}
                onChange={(event) => {
                  setId(event.target.value);
                  setOwned({});
                }}
              >
                <option value="">Выберите из справочника</option>
                {data.costs
                  .filter((row) => row.kind === kind)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              С уровня
              <input
                type="number"
                min={1}
                max={80}
                value={from}
                onChange={(event) => setFrom(Number(event.target.value))}
              />
            </label>
            <label>
              До уровня
              <input
                type="number"
                min={from}
                max={80}
                value={to}
                onChange={(event) => setTo(Number(event.target.value))}
              />
            </label>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={ascended}
              onChange={(event) => setAscended(event.target.checked)}
            />{' '}
            Возвышение на текущем уровне уже выполнено
          </label>
          {validation ? <p role="alert">{validation}</p> : null}
          {result ? (
            <>
              <p className="progression-calculator__experience">
                Опыт уровней:{' '}
                <strong>{result.experience.toLocaleString('ru-RU')}</strong>
              </p>
              {result.missingLevels.length ? (
                <p role="status">
                  Не хватает строк опыта для уровней:{' '}
                  {result.missingLevels.join(', ')}. Итог опыта неполный.
                </p>
              ) : null}
              {result.missingAscension ? (
                <p role="status">
                  Для выбранного персонажа или дуги не найдены материалы
                  возвышений. Сумма ниже неполная.
                </p>
              ) : null}
              <div className="progression-calculator__materials">
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
                        width={48}
                        height={48}
                        alt=""
                      />
                    ) : null}
                    <div>
                      <strong>{item.name}</strong>
                      <p>
                        {'excess' in item
                          ? 'Для опыта'
                          : item.id === 'gold'
                            ? 'На прокачку'
                            : 'На возвышения'}
                        : {item.amount.toLocaleString('ru-RU')}
                        {'excess' in item &&
                        typeof item.excess === 'number' &&
                        item.excess > 0
                          ? ` · запас опыта ${item.excess.toLocaleString('ru-RU')}`
                          : ''}
                      </p>
                    </div>
                    <label>
                      Уже есть: {item.name}
                      <input
                        type="number"
                        min={0}
                        max={999999999}
                        value={owned[item.id] || 0}
                        onChange={(event) =>
                          setOwned({
                            ...owned,
                            [item.id]: Math.max(0, Number(event.target.value)),
                          })
                        }
                      />
                    </label>
                    <output>
                      Нужно ещё: {item.needed.toLocaleString('ru-RU')}
                    </output>
                  </article>
                ))}
              </div>
              <p>
                Предметы опыта рассчитаны для выбранного вида, без смешивания.
              </p>
              {!result.experienceCurrencyKnown ? (
                <p role="status">
                  Стоимость применения выбранных предметов опыта в жук-монетах
                  пока неизвестна и не включена в итог.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </details>
  );
}
