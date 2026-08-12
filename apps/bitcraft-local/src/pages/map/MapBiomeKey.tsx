import React from "react";
import { Palette } from "lucide-react";

import { terrainBiomeColour } from "../../shared/terrainBiomes.mjs";
import { TERRAIN_LEGEND_GROUPS } from "../../shared/terrainPaletteDefinition.mjs";
import type { TerrainBiomeStatus } from "./terrainTileStatus.mjs";

type MapBiomeKeyProps = {
  biomes: TerrainBiomeStatus[];
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

export function MapBiomeKey({ biomes, activeBiomeType, pinnedBiomeType, onPreview, onLeave, onPin, onClear }: MapBiomeKeyProps) {
  const [open, setOpen] = React.useState(false);
  const sortedBiomes = [...biomes].sort((left, right) => left.biomeType - right.biomeType);
  const waterEntries = TERRAIN_LEGEND_GROUPS.find(({ key }) => key === "water")?.entries ?? [];
  return (
    <div className="native-map-biome-key">
      <button type="button" className="native-map-layers-button" aria-expanded={open} aria-controls="native-map-biome-key-popover" onClick={() => setOpen((value) => !value)}>
        <Palette size={16} aria-hidden="true" />
        <span>Key</span>
      </button>
      {open ? (
        <div
          id="native-map-biome-key-popover"
          className="native-map-biome-key-popover"
          role="group"
          aria-label="Terrain colour key"
          onKeyDown={(event) => { if (event.key === "Escape") onClear(); }}
        >
          <section aria-labelledby="native-map-biome-key-biomes">
            <h3 id="native-map-biome-key-biomes">Biomes</h3>
            <div className="native-map-biome-key-grid">
              {sortedBiomes.map((biome) => {
                const colour = terrainBiomeColour(biome.biomeType);
                const unavailable = !biome.present;
                return (
                  <button
                    type="button"
                    className={`native-map-biome-key-row${activeBiomeType === biome.biomeType ? " is-active" : ""}${pinnedBiomeType === biome.biomeType ? " is-pinned" : ""}${unavailable ? " is-unavailable" : ""}`}
                    key={biome.biomeType}
                    disabled={!biome.present}
                    aria-pressed={pinnedBiomeType === biome.biomeType}
                    title={unavailable ? "Not present in this terrain generation" : [biome.description, biome.hazardLevel].filter(Boolean).join(" · ")}
                    onPointerEnter={() => onPreview(biome.biomeType)}
                    onPointerLeave={onLeave}
                    onFocus={() => onPreview(biome.biomeType)}
                    onBlur={onLeave}
                    onClick={() => onPin(biome.biomeType)}
                  >
                    <span className="native-map-biome-key-swatch" aria-hidden="true" style={{ backgroundColor: rgba(colour) }} />
                    <span>{biome.name}</span>
                    {unavailable ? <small>Not present in this terrain generation</small> : null}
                  </button>
                );
              })}
            </div>
          </section>
          <section aria-labelledby="native-map-biome-key-water">
            <h3 id="native-map-biome-key-water">Water types</h3>
            <div className="native-map-biome-key-grid">
              {waterEntries.map((entry) => (
                <div className="native-map-biome-key-row" key={entry.key}>
                  <span className="native-map-biome-key-swatch" aria-hidden="true" style={{ backgroundColor: rgba(entry.rgba) }} />
                  <span>{entry.label}</span>
                </div>
              ))}
            </div>
          </section>
          <p>Hover or focus to preview; click to pin.</p>
          <p>Terrain shading varies with elevation, biome density, relief, texture, water depth, and shorelines.</p>
        </div>
      ) : null}
    </div>
  );
}
