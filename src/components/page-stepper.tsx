import { ChevronLeft, ChevronRight } from 'lucide-react';

export function PageStepper({
  value,
  total,
  onChange,
  label,
  unit = 'Страница',
}: {
  value: number;
  total: number;
  onChange: (value: number) => void;
  label: string;
  unit?: string;
}) {
  return (
    <div className="page-stepper" role="group" aria-label={label}>
      <button
        type="button"
        className="icon-button"
        disabled={value <= 1}
        aria-label={`${label}: назад`}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <span aria-live="polite" aria-atomic="true">
        {unit} <strong>{value}</strong>{' '}
        <span className="page-stepper__total">из {total}</span>
      </span>
      <button
        type="button"
        className="icon-button"
        disabled={value >= total}
        aria-label={`${label}: вперёд`}
        onClick={() => onChange(Math.min(total, value + 1))}
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );
}
