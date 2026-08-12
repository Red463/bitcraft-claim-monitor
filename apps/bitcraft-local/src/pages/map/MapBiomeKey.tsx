import React from "react";
import { Palette } from "lucide-react";

import { TERRAIN_LEGEND_GROUPS } from "../../shared/terrainPaletteDefinition.mjs";

export function MapBiomeKey() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="native-map-biome-key">
      <button type="button" className="native-map-layers-button" aria-expanded={open} aria-controls="native-map-biome-key-popover" onClick={() => setOpen((value) => !value)}>
        <Palette size={16} aria-hidden="true" />
        <span>Key</span>
      </button>
      {open ? (
        <div id="native-map-biome-key-popover" className="native-map-biome-key-popover" role="group" aria-label="Terrain colour key">
          {TERRAIN_LEGEND_GROUPS.map((group) => (
            <section key={group.key} aria-labelledby={`native-map-biome-key-${group.key}`}>
              <h3 id={`native-map-biome-key-${group.key}`}>{group.label}</h3>
              <div className="native-map-biome-key-grid">
                {group.entries.map((entry) => (
                  <div className="native-map-biome-key-row" key={entry.key}>
                    <span
                      className="native-map-biome-key-swatch"
                      aria-hidden="true"
                      style={{ backgroundColor: `rgba(${entry.rgba[0]}, ${entry.rgba[1]}, ${entry.rgba[2]}, ${entry.rgba[3] / 255})` }}
                    />
                    <span>{entry.label}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
          <p>Terrain shading varies with elevation, biome density, relief, texture, water depth, and shorelines.</p>
        </div>
      ) : null}
    </div>
  );
}
