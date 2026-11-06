import type { CharacterStat } from '../../types';
import { useState } from 'react';

export function VariantStatsEditor({
  value,
  onChange,
}: {
  value: CharacterStat[];
  onChange: (value: CharacterStat[]) => void;
}) {
  const [selected, setSelected] = useState('');
  const index = Math.max(
    0,
    value.findIndex((row) => row.id === selected),
  );
  const row = value[index];
  const patch = (index: number, next: Partial<CharacterStat>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...next } : row)));
  return (
    <section
      className="appearance-variant-editor-part variant-stats-editor"
      aria-label="Начальные показатели варианта"
    >
      <div className="panel-title-row">
        <h4>Начальные показатели варианта</h4>
        <button
          className="ghost-button"
          type="button"
          disabled={value.length >= 40}
          onClick={() => {
            const id = crypto.randomUUID();
            onChange([...value, { id, label: '', value: '' }]);
            setSelected(id);
          }}
        >
          Добавить показатель
        </button>
      </div>
      {!value.length && (
        <p className="muted">
          Используются общие начальные показатели персонажа.
        </p>
      )}
      {row && (
        <>
          <label>
            Показатель для редактирования
            <select
              value={row.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {value.map((stat, i) => (
                <option key={stat.id} value={stat.id}>
                  {stat.label || `Показатель ${i + 1}`}
                  {stat.value ? ` · ${stat.value}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid" key={row.id}>
            <label>
              Показатель {index + 1}
              <input
                value={row.label}
                maxLength={120}
                onChange={(e) => patch(index, { label: e.target.value })}
              />
            </label>
            <label>
              Значение {index + 1}
              <input
                value={row.value}
                maxLength={120}
                onChange={(e) => patch(index, { value: e.target.value })}
              />
            </label>
            <button
              className="ghost-button danger-action"
              type="button"
              aria-label={`Удалить показатель ${row.label || index + 1}`}
              onClick={() => {
                onChange(value.filter((_, i) => i !== index));
                setSelected(value[Math.max(0, index - 1)]?.id || '');
              }}
            >
              Удалить
            </button>
          </div>
        </>
      )}
    </section>
  );
}
