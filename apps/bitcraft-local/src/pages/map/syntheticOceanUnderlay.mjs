import { terrainWaterRgba } from "../../shared/terrainPaletteDefinition.mjs";
import { MAP_WORLD_BOUNDS } from "./mapCoordinates.mjs";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const rgb = ([red, green, blue]) => `rgb(${red} ${green} ${blue})`;

export const SYNTHETIC_OCEAN_LEAFLET_BOUNDS = Object.freeze([
  Object.freeze([MAP_WORLD_BOUNDS.minZ, MAP_WORLD_BOUNDS.minX]),
  Object.freeze([MAP_WORLD_BOUNDS.maxZ, MAP_WORLD_BOUNDS.maxX]),
]);

export function syntheticOceanColours() {
  const ocean = terrainWaterRgba({ surface: "ocean", depth: 24 });
  if (!ocean) throw new Error("Canonical ocean colour is unavailable");
  return Object.freeze({ base: rgb(ocean) });
}

export function terrainStatusSupportsSyntheticOcean(status) {
  return Boolean(status?.available && status.generation);
}

export function createSyntheticOceanLayerController({ map, createLayer, onUnavailable = () => {} }) {
  let layer = null;
  const removeLayer = () => {
    if (!layer) return;
    const currentLayer = layer;
    layer = null;
    currentLayer.removeFrom(map);
  };
  return Object.freeze({
    sync(enabled) {
      removeLayer();
      if (!enabled) return null;
      try {
        layer = createLayer().addTo(map);
        return layer;
      } catch {
        onUnavailable();
        return null;
      }
    },
    dispose() {
      removeLayer();
    },
  });
}

function svgElement(documentLike, tagName, attributes) {
  const element = documentLike.createElementNS(SVG_NAMESPACE, tagName);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

export function createSyntheticOceanSvg(documentLike) {
  if (!documentLike || typeof documentLike.createElementNS !== "function") {
    throw new TypeError("Synthetic ocean SVG requires createElementNS");
  }
  const width = MAP_WORLD_BOUNDS.maxX - MAP_WORLD_BOUNDS.minX;
  const height = MAP_WORLD_BOUNDS.maxZ - MAP_WORLD_BOUNDS.minZ;
  const colours = syntheticOceanColours();
  const svg = svgElement(documentLike, "svg", {
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "none",
    "aria-hidden": "true",
    focusable: "false",
  });
  svg.appendChild(svgElement(documentLike, "rect", { width, height, fill: colours.base }));
  return svg;
}
