type SegmentedOption<T extends string> = { id: T; label: string; count?: number };
type SegmentedProps<T extends string> = {
  label: string;
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
};

export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      <span>{label}:</span>
      {options.map((option) => <button key={option.id} type="button" className={value === option.id ? "active" : ""} aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}{option.count == null ? null : ` (${option.count})`}</button>)}
    </div>
  );
}
