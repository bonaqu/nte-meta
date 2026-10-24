export function CharacterAppearanceSelector({
  variants,
  value,
  label,
  onChange,
}: {
  variants: ReadonlyArray<{ id: string; name: string }>;
  value: string;
  label: string;
  onChange: (id: string) => void;
}) {
  if (variants.length < 2) return null;
  return (
    <div
      className="character-appearance-picker"
      role="group"
      aria-label={label}
    >
      {variants.map((variant) => (
        <button
          key={variant.id}
          type="button"
          className="ghost-button"
          aria-pressed={value === variant.id}
          onClick={() => onChange(variant.id)}
        >
          {variant.name}
        </button>
      ))}
    </div>
  );
}
