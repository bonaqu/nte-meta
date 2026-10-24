import { useId, useState } from 'react';
import type { CharacterAbilityAttribute } from '../types';

const format = (rows: CharacterAbilityAttribute[]) =>
  rows
    .map((row) =>
      [row.label.trim(), row.value.trim()].filter(Boolean).join(' — '),
    )
    .filter(Boolean)
    .join('\n');
export function AbilityAttributesField({
  value,
  onChange,
  label = 'Атрибуты',
}: {
  value: CharacterAbilityAttribute[];
  onChange: (value: CharacterAbilityAttribute[]) => void;
  label?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  return (
    <div className="wide-field ability-attributes-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        aria-describedby={`${id}-help`}
        rows={6}
        placeholder={'Коэфф. урона 1-го удара — 16,7 %\nЭнергия циклов — 33'}
        value={editing ? draft : format(value)}
        onFocus={() => {
          setDraft(format(value));
          setEditing(true);
        }}
        onBlur={() => setEditing(false)}
        onChange={(event) => {
          const text = event.target.value;
          setDraft(text);
          onChange(
            text
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
              .slice(0, 80)
              .map((line, index) => {
                const separator = line.match(
                  /^(.{1,160}?)(?:\s+[—–-]\s+|:\s*)(.+)$/,
                );
                return {
                  id: value[index]?.id || crypto.randomUUID(),
                  label: (separator?.[1] || line).trim(),
                  value: (separator?.[2] || '').trim(),
                };
              }),
          );
        }}
      />
      <small id={`${id}-help`}>
        Один показатель на строку: название, тире и значение.
      </small>
    </div>
  );
}
