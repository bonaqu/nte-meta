import { useState } from 'react';
import type { CharacterAbility } from '../../types';
import { PageStepper } from '../../components/page-stepper';
import { ImageField } from '../../components/image-field';
import { AbilityAttributesField } from '../../components/ability-attributes-field';

export function VariantAbilitiesEditor({
  value,
  common,
  context,
  onChange,
}: {
  value: CharacterAbility[];
  common: CharacterAbility[];
  context: string;
  onChange: (value: CharacterAbility[]) => void;
}) {
  const [page, setPage] = useState(1);
  const index = Math.min(page - 1, Math.max(0, value.length - 1));
  const ability = value[index];
  const patch = (next: Partial<CharacterAbility>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...next } : row)));
  const types = [
    ...new Set(
      [
        'Базовая атака',
        'Навык',
        'Навык перенаправления',
        'Сверхспособность',
        'Навык поддержки',
        'Пассивный навык',
        'Черта персонажа',
        'Повседневный навык',
        ability?.type,
      ].filter(Boolean),
    ),
  ];
  return (
    <section
      className="appearance-variant-editor-part"
      aria-label="Способности выбранного варианта"
    >
      <div className="panel-title-row">
        <h4>Способности варианта</h4>
        <button
          type="button"
          className="ghost-button"
          disabled={value.length >= 30}
          onClick={() => {
            onChange([
              ...value,
              {
                id: crypto.randomUUID(),
                name: '',
                type: 'Базовая атака',
                iconUrl: '',
                description: '',
                attributes: [],
              },
            ]);
            setPage(value.length + 1);
          }}
        >
          Добавить способность варианта
        </button>
      </div>
      {ability ? (
        <>
          <PageStepper
            label="Способности в редакторе варианта"
            unit="Навык"
            value={index + 1}
            total={value.length}
            onChange={setPage}
          />
          <div className="form-grid" key={ability.id}>
            <label>
              Название способности варианта
              <input
                value={ability.name}
                maxLength={160}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <label>
              Тип способности варианта
              <select
                value={ability.type}
                onChange={(e) => patch({ type: e.target.value })}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <ImageField
              label="Иконка способности варианта"
              value={ability.iconUrl}
              onChange={(iconUrl) => patch({ iconUrl })}
              context={`${context}/abilities`}
            />
            <label className="wide-field">
              Описание способности варианта
              <textarea
                rows={5}
                value={ability.description}
                onChange={(e) => patch({ description: e.target.value })}
              />
            </label>
            <AbilityAttributesField
              label="Атрибуты способности варианта"
              value={ability.attributes || []}
              onChange={(attributes) => patch({ attributes })}
            />
            <button
              type="button"
              className="ghost-button danger-action"
              onClick={() => onChange(value.filter((_, i) => i !== index))}
            >
              Удалить способность варианта
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="empty-inline-copy">
            Используются общие способности персонажа.
          </p>
          <button
            type="button"
            className="ghost-button"
            disabled={!common.length}
            onClick={() => onChange(structuredClone(common))}
          >
            Скопировать общие способности
          </button>
        </>
      )}
    </section>
  );
}
