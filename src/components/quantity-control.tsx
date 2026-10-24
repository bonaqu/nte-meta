import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { ChevronsUp, Minus, Plus } from 'lucide-react';

export function QuantityControl({
  label,
  value,
  onChange,
  min = 0,
  max,
  sliderMax,
  disabled = false,
  id,
  name,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  sliderMax?: number;
  disabled?: boolean;
  id?: string;
  name?: string;
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const upper = max ?? Number.MAX_SAFE_INTEGER;
  const clamp = (number: number) =>
    Math.min(upper, Math.max(min, Math.round(number)));
  const rangeMax = max ?? sliderMax;
  const start = () => {
    input.current?.setCustomValidity('');
    setDraft(String(value));
    setError('');
    setEditing(true);
  };
  useLayoutEffect(() => {
    if (editing) {
      input.current?.focus({ preventScroll: true });
      input.current?.select();
    }
  }, [editing]);
  const commit = () => {
    if (!editing) return;
    if (!draft.trim()) {
      input.current?.setCustomValidity('');
      setEditing(false);
      setError('');
      return;
    }
    const normalized = draft.trim().replace(/[\s\u00a0\u202f]/g, '');
    const parsed = Number(normalized);
    if (!/^-?\d+$/.test(normalized) || !Number.isSafeInteger(parsed)) {
      const message = 'Введите целое число без букв и дробной части.';
      input.current?.setCustomValidity(message);
      setError(message);
      return;
    }
    onChange(clamp(parsed));
    input.current?.setCustomValidity('');
    setEditing(false);
    setError('');
  };
  const change = (next: number) => {
    input.current?.setCustomValidity('');
    onChange(clamp(next));
    setEditing(false);
    setError('');
  };
  return (
    <div
      className="quantity-control"
      role="group"
      aria-label={`Количество: ${label}`}
    >
      <label htmlFor={inputId}>{label}</label>
      <div
        className={`quantity-control__rail${max !== undefined ? ' has-max' : ''}`}
      >
        <input
          ref={input}
          id={inputId}
          name={name}
          type="text"
          role="spinbutton"
          inputMode="numeric"
          className="quantity-control__value"
          value={editing ? draft : value}
          readOnly={!editing}
          disabled={disabled}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-invalid={Boolean(error)}
          aria-describedby={`${inputId}-help${error ? ` ${inputId}-error` : ''}`}
          title="Двойной щелчок или Enter — ввести число"
          maxLength={24}
          onDoubleClick={start}
          onPointerUp={(event) => {
            if (event.pointerType === 'touch' && !editing) start();
          }}
          onChange={(event) => {
            input.current?.setCustomValidity('');
            setError('');
            setDraft(event.target.value.slice(0, 24));
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              input.current?.setCustomValidity('');
              event.preventDefault();
              setEditing(false);
              setError('');
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (editing) commit();
              else start();
            } else if (!editing && event.key === 'F2') {
              event.preventDefault();
              start();
            } else if (
              !editing &&
              ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
            ) {
              event.preventDefault();
              if (event.key === 'ArrowUp') change(value + 1);
              if (event.key === 'ArrowDown') change(value - 1);
              if (event.key === 'Home') change(min);
              if (event.key === 'End' && max !== undefined) change(max);
            }
          }}
        />
        <button
          type="button"
          aria-label={`Уменьшить: ${label}`}
          disabled={disabled || value <= min}
          onClick={() => change(value - 1)}
        >
          <Minus aria-hidden="true" />
        </button>
        {rangeMax !== undefined && rangeMax > min ? (
          <input
            className="quantity-control__slider"
            type="range"
            min={min}
            max={rangeMax}
            step={1}
            value={Math.min(rangeMax, value)}
            disabled={disabled}
            aria-label={`Ползунок: ${label}`}
            onChange={(event) => change(Number(event.target.value))}
            style={
              {
                '--quantity-fill': `${Math.min(100, Math.max(0, ((value - min) / (rangeMax - min)) * 100))}%`,
              } as CSSProperties
            }
          />
        ) : null}
        <button
          type="button"
          aria-label={`Увеличить: ${label}`}
          disabled={disabled || value >= upper}
          onClick={() => change(value + 1)}
        >
          <Plus aria-hidden="true" />
        </button>
        {max !== undefined ? (
          <button
            type="button"
            aria-label={`Максимум: ${label}`}
            disabled={disabled || value >= max}
            onClick={() => change(max)}
          >
            <ChevronsUp aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <span className="sr-only" id={`${inputId}-help`}>
        Двойной щелчок или Enter — ввод числа. Enter — применить, Escape —
        отменить. Минимум {min}
        {max !== undefined ? `, максимум ${max}` : ''}.
      </span>
      {error ? (
        <small
          className="quantity-control__error"
          role="alert"
          id={`${inputId}-error`}
        >
          {error}
        </small>
      ) : null}
    </div>
  );
}
