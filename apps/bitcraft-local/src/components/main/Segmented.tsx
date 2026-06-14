export function Segmented({ options, value, onChange, label }: { options: string[]; value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <div className="segmented" aria-label={label}>
      {label ? <span>{label}:</span> : null}
      {options.map((option) => <button key={option} className={value === option ? "active" : ""} onClick={() => onChange(option)}>{option}</button>)}
    </div>
  );
}
