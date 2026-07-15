import { Search } from "lucide-react";

type SearchBoxProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultsId?: string;
};

export function SearchBox({ label, value, onChange, placeholder, resultsId }: SearchBoxProps) {
  return (
    <label className="search">
      <Search size={16} />
      <input aria-label={label} aria-controls={resultsId} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
