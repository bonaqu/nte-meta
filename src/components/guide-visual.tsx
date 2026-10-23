import { ArrowDown, ArrowUp, Plus, Trash2, Copy } from 'lucide-react';
import type { Character, GuideVisual, GuideVisualItem } from '../types';
import { resolveAssetUrl } from '../lib/assets';
import { newVisualItem } from '../lib/guide-visual';
import { ImageField } from './image-field';
import { useState } from 'react';
import { findEquipment } from '../lib/api';

function EquipmentLookup({
  kind,
  item,
  onSelect,
}: {
  kind: 'arcs' | 'cartridges';
  item: GuideVisualItem;
  onSelect: (item: Partial<GuideVisualItem>) => void;
}) {
  const [query, setQuery] = useState(
    item.name.replace(/^(?:Дуга|Картридж):\s*/, ''),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [sources, setSources] = useState<Array<{
    name: string;
    status: string;
    message?: string;
    items: Array<Omit<GuideVisualItem, 'id'>>;
  }> | null>(null);
  return (
    <details className="equipment-lookup">
      <summary>Найти характеристики и изображение</summary>
      <label>
        Название экипировки
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Название на языке источника"
          maxLength={160}
        />
      </label>
      <button
        type="button"
        className="ghost-button"
        disabled={pending || query.trim().length < 2}
        onClick={async () => {
          setPending(true);
          setError('');
          setSources(null);
          const result = await findEquipment(query, kind);
          setPending(false);
          if (result.ok) setSources(result.data.sources);
          else setError(result.error);
        }}
      >
        {pending ? 'Ищем экипировку…' : 'Найти в источниках'}
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {sources?.map((source) => (
        <div key={source.name}>
          <h4>{source.name}</h4>
          {source.message ? (
            <p>{source.message}</p>
          ) : !source.items.length ? (
            <p>Совпадений нет. Попробуйте название на английском.</p>
          ) : null}
          {source.items.map((row, index) => (
            <div key={index} className="equipment-result">
              <GuideVisualView
                value={{
                  kind,
                  items: [
                    { ...row, id: String(index), category: item.category },
                  ],
                }}
              />
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  onSelect(row);
                  setSources(null);
                }}
              >
                Использовать данные
              </button>
              {row.sourceUrl ? (
                <a href={row.sourceUrl} target="_blank" rel="noreferrer">
                  Открыть источник
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </details>
  );
}

const categoryLabels = {
  signature: 'Основной вариант',
  replacement: 'На замену',
  budget: 'Бюджетный вариант',
};
export function GuideVisualView({ value }: { value: GuideVisual }) {
  const equipment = value.kind === 'arcs' || value.kind === 'cartridges';
  const items = equipment
    ? [...value.items].sort(
        (a, b) =>
          ['signature', 'replacement', 'budget'].indexOf(
            a.category || 'replacement',
          ) -
          ['signature', 'replacement', 'budget'].indexOf(
            b.category || 'replacement',
          ),
      )
    : value.items;
  return (
    <ol className={`guide-visual guide-visual--${value.kind}`}>
      {items.map((item, index) => (
        <li
          key={item.id}
          className={
            equipment
              ? `guide-visual__equipment guide-visual__equipment--${item.category || 'replacement'}`
              : undefined
          }
        >
          <span
            className="guide-visual__position"
            aria-label={`Позиция ${index + 1}`}
          >
            {index + 1}
          </span>
          {item.imageUrl ? (
            <img
              src={resolveAssetUrl(item.imageUrl)}
              width={equipment ? 128 : 64}
              height={equipment ? 128 : 64}
              alt={item.name}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          ) : null}
          <div className="guide-visual__body">
            <div className="guide-visual__heading">
              {equipment ? (
                <small className="eyebrow">
                  {categoryLabels[item.category || 'replacement']}
                </small>
              ) : null}
              <h3>{item.name}</h3>
            </div>
            {item.description ? <p>{item.description}</p> : null}
            {item.stats.length ? (
              <dl className="guide-visual__stats">
                {item.stats.map((stat, i) => (
                  <div key={i}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
export function GuideVisualEditor({
  value,
  onChange,
  context,
  character,
}: {
  value: GuideVisual;
  onChange: (value: GuideVisual) => void;
  context: string;
  character?: Character;
}) {
  const equipment = value.kind === 'arcs' || value.kind === 'cartridges';
  function patch(id: string, fields: Partial<GuideVisualItem>) {
    onChange({
      ...value,
      items: value.items.map((item) =>
        item.id === id ? { ...item, ...fields } : item,
      ),
    });
  }
  function move(index: number, direction: number) {
    const items = [...value.items];
    const next = index + direction;
    if (next < 0 || next >= items.length) return;
    [items[index], items[next]] = [items[next], items[index]];
    onChange({ ...value, items });
  }
  return (
    <div className="visual-section-editor">
      <div className="visual-section-editor__summary">
        <strong>
          {value.kind === 'rotation'
            ? 'Пошаговая ротация'
            : value.kind === 'skills'
              ? 'Порядок прокачки'
              : value.kind === 'stats'
                ? 'Основные характеристики'
                : 'Подбор экипировки'}
        </strong>
        <span>
          {value.items.length} {value.kind === 'rotation' ? 'шагов' : 'позиций'}
        </span>
        <a href="#visual-section-preview">К предпросмотру</a>
      </div>
      {value.items.map((item, index) => (
        <fieldset key={item.id} className="visual-item-editor">
          <legend>
            {value.kind === 'rotation' ? 'Шаг' : 'Позиция'} {index + 1}
            {item.name ? ` · ${item.name}` : ''}
          </legend>
          <div className="button-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                const items = [...value.items];
                items.splice(index + 1, 0, {
                  ...item,
                  id: newVisualItem().id,
                  stats: item.stats.map((stat) => ({ ...stat })),
                });
                onChange({ ...value, items });
              }}
            >
              <Copy aria-hidden="true" />
              Дублировать
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={index === 0}
              aria-label={`Поднять элемент ${index + 1}`}
              onClick={() => move(index, -1)}
            >
              <ArrowUp aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              disabled={index === value.items.length - 1}
              aria-label={`Опустить элемент ${index + 1}`}
              onClick={() => move(index, 1)}
            >
              <ArrowDown aria-hidden="true" />
            </button>
            <button
              className="ghost-button"
              type="button"
              onClick={() =>
                onChange({
                  ...value,
                  items: value.items.filter((row) => row.id !== item.id),
                })
              }
            >
              <Trash2 aria-hidden="true" /> Удалить элемент
            </button>
          </div>
          {equipment ? (
            <label>
              Рекомендация
              <select
                value={item.category || 'replacement'}
                onChange={(e) =>
                  patch(item.id, {
                    category: e.target.value as GuideVisualItem['category'],
                  })
                }
              >
                <option value="signature">
                  Основной / сигнатурный вариант
                </option>
                <option value="replacement">Замена</option>
                <option value="budget">Бюджетная альтернатива</option>
              </select>
            </label>
          ) : null}
          {equipment ? (
            <EquipmentLookup
              kind={value.kind as 'arcs' | 'cartridges'}
              item={item}
              onSelect={(fields) => patch(item.id, fields)}
            />
          ) : null}
          {value.kind === 'skills' && character?.profile?.abilities?.length ? (
            <label>
              Навык персонажа
              <select
                value=""
                onChange={(e) => {
                  const ability = character.profile!.abilities!.find(
                    (row) => row.id === e.target.value,
                  );
                  if (ability)
                    patch(item.id, {
                      name: ability.name,
                      imageUrl: ability.iconUrl,
                    });
                }}
              >
                <option value="">Выбрать навык и иконку</option>
                {character.profile.abilities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} — {a.type}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            {value.kind === 'rotation' ? 'Действие' : 'Название'}
            <input
              value={item.name}
              maxLength={600}
              onChange={(e) => patch(item.id, { name: e.target.value })}
            />
          </label>
          <label>
            Краткое описание
            <textarea
              value={item.description}
              maxLength={6000}
              rows={3}
              onChange={(e) => patch(item.id, { description: e.target.value })}
            />
          </label>
          {value.kind !== 'stats' ? (
            <ImageField
              label={value.kind === 'skills' ? 'Иконка навыка' : 'Изображение'}
              value={item.imageUrl}
              onChange={(imageUrl) => patch(item.id, { imageUrl })}
              context={`${context}/${item.id}`}
            />
          ) : null}
          {equipment || value.kind === 'stats' ? (
            <div className="visual-stat-editor">
              {item.stats.map((stat, i) => (
                <div key={i} className="form-grid">
                  <label>
                    Характеристика
                    <input
                      value={stat.label}
                      onChange={(e) =>
                        patch(item.id, {
                          stats: item.stats.map((row, j) =>
                            j === i ? { ...row, label: e.target.value } : row,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Значение
                    <input
                      value={stat.value}
                      onChange={(e) =>
                        patch(item.id, {
                          stats: item.stats.map((row, j) =>
                            j === i ? { ...row, value: e.target.value } : row,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() =>
                      patch(item.id, {
                        stats: item.stats.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Убрать характеристику
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="ghost-button"
                onClick={() =>
                  patch(item.id, {
                    stats: [...item.stats, { label: '', value: '' }],
                  })
                }
              >
                Добавить характеристику
              </button>
            </div>
          ) : null}
        </fieldset>
      ))}
      <button
        type="button"
        className="ghost-button"
        disabled={value.items.length >= 40}
        onClick={() =>
          onChange({
            ...value,
            items: [
              ...value.items,
              {
                ...newVisualItem(),
                ...(equipment
                  ? ({
                      category: value.items.length
                        ? 'replacement'
                        : 'signature',
                    } as const)
                  : {}),
              },
            ],
          })
        }
      >
        <Plus aria-hidden="true" />{' '}
        {value.kind === 'rotation' ? 'Добавить шаг' : 'Добавить элемент'}
      </button>
      <details
        id="visual-section-preview"
        className="visual-section-preview"
        open
      >
        <summary>Предпросмотр секции</summary>
        <GuideVisualView value={value} />
      </details>
    </div>
  );
}
