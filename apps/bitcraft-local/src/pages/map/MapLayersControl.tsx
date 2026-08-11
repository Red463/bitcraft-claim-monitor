import React from "react";
import { Layers3 } from "lucide-react";

import { MAP_LAYER_DEFINITIONS, type MapLayerKey, type MapLayerVisibility } from "./mapLayerPreferences.mjs";

type LayerAvailability = Record<string, { available: boolean; reason: string | null }>;

export function MapLayersControl({ visibility, availability, counts, onToggle }: {
  visibility: MapLayerVisibility;
  availability: LayerAvailability;
  counts: Record<string, number | null>;
  onToggle: (key: MapLayerKey) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="native-map-layers-control">
      <button type="button" className="native-map-layers-button" aria-expanded={open} aria-controls="native-map-layers-popover" onClick={() => setOpen((value) => !value)}>
        <Layers3 size={16} aria-hidden="true" />
        <span>Layers</span>
      </button>
      {open ? (
        <div id="native-map-layers-popover" className="native-map-layers-popover" role="group" aria-label="Map layer visibility">
          {MAP_LAYER_DEFINITIONS.map(({ key, label }) => {
            const status = availability[key] ?? { available: true, reason: null };
            const reasonId = `native-map-layer-${key}-reason`;
            return (
              <label className={`native-map-layer-row${status.available ? "" : " is-unavailable"}`} key={key}>
                <input type="checkbox" checked={visibility[key]} disabled={!status.available} aria-describedby={status.available ? undefined : reasonId} onChange={() => onToggle(key)} />
                <span className="native-map-layer-copy">
                  <strong>{label}</strong>
                  {!status.available && status.reason ? <small id={reasonId}>{status.reason}</small> : null}
                </span>
                {typeof counts[key] === "number" ? <span className="native-map-layer-count">{counts[key]}</span> : null}
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
