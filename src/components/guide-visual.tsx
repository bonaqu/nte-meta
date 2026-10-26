import { ArrowDown, ArrowUp, Plus, Trash2, Copy } from 'lucide-react';
import type { Character, GuideVisual, GuideVisualItem } from '../types';
import { resolveAssetUrl } from '../lib/assets';
import { newVisualItem } from '../lib/guide-visual';
import { ImageField } from './image-field';
import { lazy, Suspense, useState } from 'react';
import { findEquipment } from '../lib/api';
import { resolveStatIcons } from '../lib/native-icons';
const ItemDetails = lazy(() =>
  import('./item-details').then((module) => ({ default: module.ItemDetails })),
);
import {
  nativeEquipmentImage,
  orderedAbilities,
} from '../lib/profile-presentation';

function StatIcons({ label, imageUrl }: { label: string; imageUrl?: string }) {
  const icons = imageUrl
    ? [resolveAssetUrl(imageUrl)]
    : resolveStatIcons(label);
  return (
    <span className="guide-stat-icons" aria-hidden="true">
      {icons.map((url) => (
        <img key={url} src={url} alt="" width="32" height="32" loading="lazy" />
      ))}
    </span>
  );
}

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
function equalPriority(item: GuideVisualItem) {
  return (
    item.equalPriority ??
    /одинаковый приоритет с предыдущим/iu.test(item.description)
  );
}
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
    <ol
      className={`guide-visual guide-visual--${value.kind}`}
      tabIndex={value.kind === 'skills' ? 0 : undefined}
      aria-label={
        value.kind === 'skills'
          ? 'Последовательность приоритета навыков'
          : undefined
      }
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          data-priority-relation={
            value.kind === 'skills' && index > 0
              ? equalPriority(item)
                ? 'equal'
                : 'next'
              : undefined
          }
          className={
            equipment
              ? `guide-visual__equipment guide-visual__equipment--${item.category || 'replacement'}`
              : undefined
          }
        >
          {equipment ? (
            <Suspense fallback={null}>
              <ItemDetails
                id={item.id}
                name={item.name.replace(/^(?:Дуга|Картридж):\s*/i, '')}
                iconUrl={nativeEquipmentImage(
                  item.name,
                  value.kind,
                  item.imageUrl,
                )}
                context={value.kind === 'arcs' ? 'Дуга' : 'Картридж'}
                iconOnly
                hoverParent
                suppliedDetail={{
                  name: item.name,
                  description: item.description,
                  usage: '',
                  type: value.kind === 'arcs' ? 'Дуга' : 'Картридж',
                  stats: item.stats,
                }}
              />
            </Suspense>
          ) : null}
          {value.kind !== 'stats' && !equipment ? (
            <span
              className="guide-visual__position"
              aria-label={`Позиция ${index + 1}`}
            >
              {value.kind === 'skills'
                ? items
                    .slice(0, index + 1)
                    .filter((row, i) => i === 0 || !equalPriority(row)).length
                : index + 1}
            </span>
          ) : null}
          {value.kind === 'stats' ? (
            <StatIcons label={item.name} imageUrl={item.imageUrl} />
          ) : nativeEquipmentImage(item.name, value.kind, item.imageUrl) ? (
            <img
              src={resolveAssetUrl(
                nativeEquipmentImage(item.name, value.kind, item.imageUrl),
              )}
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
              {value.kind === 'rotation' &&
              /^шаг\s*\d+\s*$/iu.test(item.name) ? null : (
                <h3>{item.name}</h3>
              )}
            </div>
            {item.description ? <p>{item.description}</p> : null}
            {item.stats.length ? (
              <dl className="guide-visual__stats">
                {item.stats.map((stat, i) => (
                  <div key={i}>
                    <dt>
                      {!/^\s*\d+\s*(?:предмет|част|модул|piece|pc)/iu.test(
                        stat.label,
                      ) ? (
                        <StatIcons label={stat.label} />
                      ) : null}
                      {stat.label}
                    </dt>
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
      </div>
      {value.items.map((item, index) => (
        <details
          key={item.id}
          className="visual-item-editor"
          open={!item.name || value.items.length === 1 || undefined}
        >
          <summary>
            <span className="visual-item-editor__index">{index + 1}</span>
            {value.kind === 'stats' ? (
              <StatIcons label={item.name} imageUrl={item.imageUrl} />
            ) : nativeEquipmentImage(item.name, value.kind, item.imageUrl) ? (
              <img
                src={resolveAssetUrl(
                  nativeEquipmentImage(item.name, value.kind, item.imageUrl),
                )}
                alt=""
                width="40"
                height="40"
                loading="lazy"
              />
            ) : null}
            <span>
              {item.name ||
                (value.kind === 'rotation'
                  ? 'Новое действие'
                  : 'Новая позиция')}
            </span>
            {equipment ? (
              <small>{categoryLabels[item.category || 'replacement']}</small>
            ) : null}
          </summary>
          <div
            className="visual-item-editor__fields"
            role="group"
            aria-label={`Позиция ${index + 1}: ${item.name || 'Новая позиция'}`}
          >
            {value.kind === 'skills' && index > 0 ? (
              <label className="guide-priority-equal">
                <input
                  type="checkbox"
                  checked={equalPriority(item)}
                  onChange={(event) =>
                    patch(item.id, { equalPriority: event.target.checked })
                  }
                />
                Одинаковый приоритет с предыдущим навыком
              </label>
            ) : null}
            <div className="button-row">
              <button
                type="button"
                className="ghost-button"
                disabled={value.items.length >= 40}
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
            {(value.kind === 'skills' || value.kind === 'rotation') &&
            character?.profile?.abilities?.length ? (
              <fieldset className="guide-ability-picker">
                <legend>Навык персонажа</legend>
                <div role="group" aria-label="Навыки для секции гайда">
                  {orderedAbilities(
                    character.profile.abilities,
                    character.name,
                    character.originalName,
                  ).map((ability) => (
                    <button
                      key={ability.id}
                      type="button"
                      aria-pressed={
                        item.name === ability.name &&
                        item.imageUrl === ability.iconUrl
                      }
                      onClick={() =>
                        patch(item.id, {
                          name: ability.name,
                          imageUrl: ability.iconUrl,
                        })
                      }
                    >
                      {ability.iconUrl ? (
                        <img
                          src={resolveAssetUrl(ability.iconUrl)}
                          alt=""
                          width="40"
                          height="40"
                          loading="lazy"
                        />
                      ) : null}
                      <span>
                        <strong>{ability.name}</strong>
                        <small>{ability.type}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
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
                onChange={(e) =>
                  patch(item.id, { description: e.target.value })
                }
              />
            </label>
            {value.kind === 'stats' ? (
              <label>
                Характеристика из игры
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value)
                      patch(item.id, {
                        name: event.target.value,
                        imageUrl: '',
                      });
                  }}
                >
                  <option value="">Выбрать характеристику и иконку</option>
                  {[
                    'Атака',
                    'ОЗ',
                    'Защита',
                    'Шанс критического попадания',
                    'Критический урон',
                    'Восстановление энергии',
                    'Бонус лечения',
                    'Бонус урона Лакшаны',
                    'Бонус урона Анимы',
                    'Бонус урона Космоса',
                    'Бонус урона Психики',
                    'Бонус урона Хаоса',
                    'Бонус урона Чар',
                  ].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {
              <ImageField
                label={
                  value.kind === 'skills'
                    ? 'Иконка навыка'
                    : value.kind === 'stats'
                      ? 'Своя иконка (необязательно)'
                      : 'Изображение'
                }
                value={item.imageUrl}
                onChange={(imageUrl) => patch(item.id, { imageUrl })}
                context={`${context}/${item.id}`}
              />
            }
            {equipment || value.kind === 'stats' ? (
              <div className="visual-stat-editor">
                {item.stats.map((stat, i) => (
                  <div key={i} className="form-grid">
                    <label>
                      Характеристика
                      <input
                        value={stat.label}
                        maxLength={120}
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
                        maxLength={500}
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
                  disabled={item.stats.length >= 24}
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
          </div>
        </details>
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
      <details className="visual-section-preview" open>
        <summary>Предпросмотр секции</summary>
        <GuideVisualView value={value} />
      </details>
    </div>
  );
}
