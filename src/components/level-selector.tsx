export function LevelSelector({
  value,
  total,
  onChange,
  label,
}: {
  value: number;
  total: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div
      className="level-selector friendship-levels"
      role="group"
      aria-label={label}
    >
      {Array.from({ length: total }, (_, index) => index + 1).map((level) => (
        <button
          type="button"
          key={level}
          aria-pressed={value === level}
          onClick={() => onChange(level)}
        >
          <small>Ур.</small>
          <strong>{level}</strong>
        </button>
      ))}
    </div>
  );
}
