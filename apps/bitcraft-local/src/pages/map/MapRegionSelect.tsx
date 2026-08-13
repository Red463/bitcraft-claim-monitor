import { MapPinned } from "lucide-react";

type RegionOption = { id: string; label: string };

type Props = {
  value: "All" | string;
  options: RegionOption[];
  onChange: (value: string) => void;
};

export function MapRegionSelect({ value, options, onChange }: Props) {
  return (
    <label className="native-map-region-select">
      <MapPinned size={16} aria-hidden="true" />
      <span className="native-map-region-label">Region</span>
      <select aria-label="Map region" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="All">All regions</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}
