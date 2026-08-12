import React from "react";
import { Trees } from "lucide-react";

import { terrainBiomeColour } from "../../shared/terrainBiomes.mjs";
import { TERRAIN_LEGEND_GROUPS } from "../../shared/terrainPaletteDefinition.mjs";
import type { TerrainBiomeStatus } from "./terrainTileStatus.mjs";

type MapBiomeKeyProps = {
  biomes: TerrainBiomeStatus[];
  waterTypes: string[];
  activeBiomeType: number | null;
  pinnedBiomeType: number | null;
  onPreview: (biomeType: number) => void;
  onLeave: () => void;
  onPin: (biomeType: number) => void;
  onClear: () => void;
};

function rgba(colour: readonly number[]) {
  return `rgba(${colour[0]}, ${colour[1]}, ${colour[2]}, ${colour[3] / 255})`;
}

export function MapBiomeKey({ biomes, waterTypes, activeBiomeType, pinnedBiomeType, onPreview, onLeave, onPin, onClear }: MapBiomeKeyProps) {
  const [open, setOpen] = React.useState(false);
  const sortedBiomes = biomes.filter((biome) => biome.present).sort((left, right) => left.biomeType - right.biomeType);
  const presentWaterTypes = new Set(waterTypes.map((waterType) => waterType === "swamp" ? "swamp-water" : waterType));
  const waterEntries = (TERRAIN_LEGEND_GROUPS.find(({ key }) => key === "water")?.entries ?? []).filter((entry) => presentWaterTypes.has(entry.key));
  return (
    <div className="native-map-biome-key">
      <button type="button" className="native-map-layers-button" aria-expanded={open} aria-controls="native-map-biome-key-popover" onClick={() => setOpen((value) => !value)}>
        <Trees size={16} aria-hidden="true" />
        <span>Biomes</span>
      </button>
      {open ? (
        <div
          id="native-map-biome-key-popover"
          className="native-map-biome-key-popover"
          role="group"
          aria-label="Terrain colour key"
          onKeyDown={(event) => { if (event.key === "Escape") onClear(); }}
        >
          <p className="native-map-biome-key-helper">Hover or focus to preview; click to pin.</p>
          <section aria-labelledby="native-map-biome-key-biomes">
            <h3 id="native-map-biome-key-biomes">Biomes</h3>
            <div className="native-map-biome-key-grid">
              {sortedBiomes.map((biome) => {
                const colour = terrainBiomeColour(biome.biomeType);
                return (
                  <button
                    type="button"
                    className={`native-map-biome-key-row${activeBiomeType === biome.biomeType ? " is-active" : ""}${pinnedBiomeType === biome.biomeType ? " is-pinned" : ""}`}
                    key={biome.biomeType}
                    aria-pressed={pinnedBiomeType === biome.biomeType}
                    title={[biome.description, biome.hazardLevel].filter(Boolean).join(" · ")}
                    onPointerEnter={() => onPreview(biome.biomeType)}
                    onPointerLeave={onLeave}
                    onFocus={() => onPreview(biome.biomeType)}
                    onBlur={onLeave}
                    onClick={() => onPin(biome.biomeType)}
                  >
                    <span className="native-map-biome-key-swatch" aria-hidden="true" style={{ backgroundColor: rgba(colour) }} />
                    <span>{biome.name}</span>
                  </button>
                );
              })}
            </div>
          </section>
          {waterEntries.length ? <section aria-labelledby="native-map-biome-key-water">
            <h3 id="native-map-biome-key-water">Water types</h3>
            <div className="native-map-biome-key-grid">
              {waterEntries.map((entry) => (
                <div className="native-map-biome-key-row" key={entry.key}>
                  <span className="native-map-biome-key-swatch" aria-hidden="true" style={{ backgroundColor: rgba(entry.rgba) }} />
                  <span>{entry.label}</span>
                </div>
              ))}
            </div>
          </section> : null}
          <p>Terrain shading varies with elevation, biome density, relief, texture, water depth, and shorelines.</p>
        </div>
      ) : null}
    </div>
  );
}
