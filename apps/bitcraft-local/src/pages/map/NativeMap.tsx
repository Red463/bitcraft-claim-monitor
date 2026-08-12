import React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { MapLayersControl } from "./MapLayersControl";
import { MAP_HEX_APOTHEM, MAP_WORLD_BOUNDS, displayHexPoint, gridTileOrigin, leafletPoint } from "./mapCoordinates.mjs";
import { planDensePointDraw } from "./mapDensePointPlan.mjs";
import { MAP_LAYER_DEFINITIONS, defaultMapLayerVisibility, loadMapLayerVisibility, saveMapLayerVisibility, type MapLayerKey } from "./mapLayerPreferences.mjs";
import { MAP_MARKER_PRESENTATIONS, claimMarkerPresentation, mapMarkerPresentation, type MapMarkerPresentation } from "./mapMarkerPresentation.mjs";
import { nativeMapRequest } from "./nativeMapRequest.mjs";
import { assignPlayerMarkerColours } from "./playerMarkerColours.mjs";
import { createMapSnapshotLoader, mapEventNeedsSnapshot } from "./mapSnapshotLoader.mjs";
import { loadTerrainTileStatus, mapTileUrl, type TerrainTileStatus } from "./terrainTileStatus.mjs";
import type { MapFocus } from "./mapUtils";

type MapPoint = { x: number; z: number; dimension: string; coordinateSpace: string };
type MapFeature = {
  kind: string;
  entityId: string;
  regionId?: string;
  name?: string;
  identity?: string;
  playerEntityId?: string;
  tier?: number | null;
  point: MapPoint;
};
type MapSnapshot = {
  generation: string;
  generatedAt: string;
  freshness: "live" | "partial" | "stale" | "unavailable";
  ageMs: number | null;
  warnings: string[];
  layers: Record<string, MapFeature[]>;
  layerAvailability?: Record<string, { available: boolean; reason: string | null }>;
};

const MAP_PROJECTION: L.Projection = {
  project(latlng) {
    return new L.Point(latlng.lng, -latlng.lat / MAP_HEX_APOTHEM);
  },
  unproject(point) {
    const projected = L.point(point);
    return new L.LatLng(-projected.y * MAP_HEX_APOTHEM, projected.x);
  },
  bounds: L.bounds([-Infinity, -Infinity], [Infinity, Infinity]),
};

const NATIVE_CRS = L.extend({}, L.CRS.Simple, {
  projection: MAP_PROJECTION,
  transformation: new L.Transformation(1, 0, 1, 0),
  scale: (zoom: number) => 2 ** zoom,
});

class CoordinateGridLayer extends L.GridLayer {
  createTile(coords: L.Coords) {
    const tile = document.createElement("canvas");
    const size = this.getTileSize();
    tile.width = size.x;
    tile.height = size.y;
    tile.setAttribute("aria-hidden", "true");
    const context = tile.getContext("2d");
    if (!context) return tile;
    context.fillStyle = "#0e1517";
    context.fillRect(0, 0, size.x, size.y);
    context.strokeStyle = "rgba(126, 164, 151, 0.24)";
    context.strokeRect(0.5, 0.5, size.x - 1, size.y - 1);
    context.fillStyle = "rgba(218, 229, 221, 0.58)";
    context.font = "12px system-ui";
    const origin = gridTileOrigin(coords, size.x);
    context.fillText(`N ${origin.north} · E ${origin.east}`, 10, 20);
    return tile;
  }
}

class DensePointLayer extends L.Layer {
  #map: L.Map | null = null;
  #canvas: HTMLCanvasElement | null = null;
  #points: MapFeature[] = [];
  #frame = 0;
  #color: string;
  #pane: string;
  #visible = true;

  constructor(color: string, pane = "overlayPane") {
    super();
    this.#color = color;
    this.#pane = pane;
  }

  setPoints(points: MapFeature[]) {
    this.#points = points;
    this.#scheduleDraw();
  }

  setVisible(visible: boolean) {
    this.#visible = visible;
    if (this.#canvas) this.#canvas.style.display = visible ? "" : "none";
    this.#scheduleDraw();
  }

  onAdd(map: L.Map) {
    this.#map = map;
    this.#canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated native-map-dense-canvas") as HTMLCanvasElement;
    (map.getPane(this.#pane) ?? map.getPanes().overlayPane).appendChild(this.#canvas);
    map.on("move zoom resize", this.#scheduleDraw, this);
    this.#scheduleDraw();
    return this;
  }

  onRemove(map: L.Map) {
    cancelAnimationFrame(this.#frame);
    map.off("move zoom resize", this.#scheduleDraw, this);
    this.#canvas?.remove();
    this.#canvas = null;
    this.#map = null;
    return this;
  }

  #scheduleDraw = () => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#draw());
  };

  #draw() {
    if (!this.#map || !this.#canvas || !this.#visible) return;
    const size = this.#map.getSize();
    const topLeft = this.#map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.#canvas, topLeft);
    this.#canvas.width = size.x;
    this.#canvas.height = size.y;
    const context = this.#canvas.getContext("2d");
    if (!context) return;
    const bounds = this.#map.getBounds().pad(0.1);
    const plan = planDensePointDraw(this.#points, (point) => bounds.contains(leafletPoint(point.point)), 25_000);
    context.fillStyle = this.#color;
    for (const point of plan.points) {
      const pixel = this.#map.latLngToContainerPoint(leafletPoint(point.point));
      context.beginPath();
      context.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }
}

const FEATURE_COLORS: Record<string, string> = {
  claim: "#f0c64f",
};
const MARKER_LAYER_KEYS = ["claims", "watchtowers", "players", "claim-areas"] as const;

function markerKindClass(kind: string) {
  return Object.hasOwn(MAP_MARKER_PRESENTATIONS, kind) ? kind : "fallback";
}

function markerIcon(kind: string, presentation: MapMarkerPresentation, color?: string) {
  const content = document.createElement("span");
  content.className = `native-map-marker-content${presentation.mode === "image" && presentation.badgeCrop ? " native-map-marker-content--badge-crop" : ""}`;
  if (kind === "player" && color) content.style.setProperty("--player-marker-color", color);
  const glyph = document.createElement("span");
  glyph.className = "native-map-marker-glyph";
  glyph.textContent = presentation.glyph;
  content.appendChild(glyph);
  if (presentation.mode === "image") {
    const image = document.createElement("img");
    image.src = presentation.iconUrl;
    image.alt = "";
    image.setAttribute("aria-hidden", "true");
    image.addEventListener("error", () => image.remove(), { once: true });
    content.prepend(image);
  }
  const size = presentation.mode === "image" && presentation.badgeCrop ? 40 : 30;
  return L.divIcon({
    className: `native-map-marker native-map-marker--${markerKindClass(kind)}`,
    html: content,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function featureLabel(feature: MapFeature) {
  return feature.name || feature.identity || `${feature.kind} ${feature.entityId}`;
}

function displayedPoint(feature: MapFeature) {
  const point = displayHexPoint(feature.point);
  return `N ${point.north}, E ${point.east}`;
}

export function NativeMap({
  regionIds,
  playerIds,
  resourceIds,
  enemyTypes,
  focus,
}: {
  regionIds: string[];
  playerIds: string[];
  resourceIds: string[];
  enemyTypes: string[];
  focus: MapFocus;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<L.Map | null>(null);
  const markerGroupsRef = React.useRef<Record<string, L.LayerGroup> | null>(null);
  const focusGroupRef = React.useRef<L.LayerGroup | null>(null);
  const ordinaryRendererRef = React.useRef<L.Canvas | null>(null);
  const resourcesRef = React.useRef<DensePointLayer | null>(null);
  const enemiesRef = React.useRef<DensePointLayer | null>(null);
  const terrainTilesRef = React.useRef<L.TileLayer | null>(null);
  const waterTilesRef = React.useRef<L.TileLayer | null>(null);
  const roadTilesRef = React.useRef<L.TileLayer | null>(null);
  const [snapshot, setSnapshot] = React.useState<MapSnapshot | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [terrainStatus, setTerrainStatus] = React.useState<TerrainTileStatus | null>(null);
  const [terrainStatusError, setTerrainStatusError] = React.useState("");
  const [layerVisibility, setLayerVisibility] = React.useState(() => typeof window === "undefined"
    ? defaultMapLayerVisibility()
    : loadMapLayerVisibility(() => window.localStorage));
  const request = React.useMemo(() => nativeMapRequest({ regionIds, playerIds, resourceIds, enemyTypes }), [regionIds.join(","), playerIds.join(","), resourceIds.join(","), enemyTypes.join(",")]);

  React.useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, { crs: NATIVE_CRS, minZoom: -6, maxZoom: 5, zoomControl: true, preferCanvas: true, attributionControl: false });
    const resourcePane = map.createPane("native-map-resources");
    resourcePane.style.zIndex = "650";
    resourcePane.style.pointerEvents = "none";
    const playerPane = map.createPane("native-map-players");
    playerPane.style.zIndex = "700";
    const bounds = L.latLngBounds([MAP_WORLD_BOUNDS.minZ, MAP_WORLD_BOUNDS.minX], [MAP_WORLD_BOUNDS.maxZ, MAP_WORLD_BOUNDS.maxX]);
    const updateClaimScale = () => {
      const scale = Math.max(0.72, Math.min(1.1, 0.72 + (map.getZoom() + 5) * 0.038));
      hostRef.current?.style.setProperty("--native-map-claim-scale", scale.toFixed(3));
    };
    map.setView([19_200, 19_200], -4);
    map.setMaxBounds(bounds.pad(0.25));
    map.on("zoomend", updateClaimScale);
    updateClaimScale();
    new CoordinateGridLayer({ tileSize: 256, noWrap: false }).addTo(map);
    ordinaryRendererRef.current = L.canvas({ padding: 0.25 });
    const markerGroups = Object.fromEntries(MARKER_LAYER_KEYS.map((key) => [key, key === "players" ? L.layerGroup([], { pane: "native-map-players" }) : L.layerGroup()]));
    for (const [key, group] of Object.entries(markerGroups)) if (layerVisibility[key as MapLayerKey]) group.addTo(map);
    markerGroupsRef.current = markerGroups;
    focusGroupRef.current = L.layerGroup().addTo(map);
    resourcesRef.current = new DensePointLayer("rgba(87, 225, 151, 0.9)", "native-map-resources").addTo(map);
    enemiesRef.current = new DensePointLayer("rgba(255, 112, 112, 0.92)").addTo(map);
    mapRef.current = map;
    return () => {
      map.off("zoomend", updateClaimScale);
      map.remove();
      mapRef.current = null;
      markerGroupsRef.current = null;
      focusGroupRef.current = null;
      ordinaryRendererRef.current = null;
      resourcesRef.current = null;
      enemiesRef.current = null;
      terrainTilesRef.current = null;
      waterTilesRef.current = null;
      roadTilesRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    saveMapLayerVisibility(() => window.localStorage, layerVisibility);
    const map = mapRef.current;
    if (!map) return;
    for (const [key, group] of Object.entries(markerGroupsRef.current ?? {})) {
      const visible = layerVisibility[key as MapLayerKey];
      if (visible && !map.hasLayer(group)) group.addTo(map);
      else if (!visible && map.hasLayer(group)) group.removeFrom(map);
    }
    resourcesRef.current?.setVisible(layerVisibility.resources);
    enemiesRef.current?.setVisible(layerVisibility.enemies);
    const roads = roadTilesRef.current;
    if (roads) {
      if (layerVisibility.roads && !map.hasLayer(roads)) roads.addTo(map);
      else if (!layerVisibility.roads && map.hasLayer(roads)) roads.removeFrom(map);
    }
  }, [layerVisibility]);

  React.useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const status = await loadTerrainTileStatus(controller.signal);
        if (!disposed) {
          setTerrainStatus(status);
          setTerrainStatusError("");
        }
      } catch (statusError) {
        if (!disposed && !controller.signal.aborted) setTerrainStatusError(statusError instanceof Error ? statusError.message : String(statusError));
      }
    };
    const visibility = () => { if (!document.hidden) void load(); };
    void load();
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, 60_000);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!terrainStatus?.available || !terrainStatus.generation) {
      terrainTilesRef.current?.removeFrom(map);
      waterTilesRef.current?.removeFrom(map);
      terrainTilesRef.current = null;
      waterTilesRef.current = null;
      return;
    }
    const tileOptions = {
      tileSize: 256,
      minZoom: -6,
      maxZoom: 5,
      minNativeZoom: -5,
      maxNativeZoom: 0,
      noWrap: false,
      keepBuffer: 2,
    };
    const terrainTiles = L.tileLayer(mapTileUrl("terrain", terrainStatus.generation), tileOptions);
    const waterTiles = L.tileLayer(mapTileUrl("water", terrainStatus.generation), tileOptions);
    terrainTilesRef.current?.removeFrom(map);
    waterTilesRef.current?.removeFrom(map);
    terrainTiles.addTo(map);
    waterTiles.addTo(map);
    terrainTilesRef.current = terrainTiles;
    waterTilesRef.current = waterTiles;
    return () => {
      terrainTiles.removeFrom(map);
      waterTiles.removeFrom(map);
      if (terrainTilesRef.current === terrainTiles) terrainTilesRef.current = null;
      if (waterTilesRef.current === waterTiles) waterTilesRef.current = null;
    };
  }, [terrainStatus?.available, terrainStatus?.generation]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    roadTilesRef.current?.removeFrom(map);
    roadTilesRef.current = null;
    const roadStatus = terrainStatus?.roads;
    if (!roadStatus?.available || !roadStatus.generation) return;
    const roads = L.tileLayer(mapTileUrl("roads", roadStatus.generation), {
      tileSize: 256,
      minZoom: -6,
      maxZoom: 5,
      minNativeZoom: -5,
      maxNativeZoom: 0,
      noWrap: false,
      keepBuffer: 2,
      pane: "overlayPane",
    });
    if (layerVisibility.roads) roads.addTo(map);
    roadTilesRef.current = roads;
    return () => {
      roads.removeFrom(map);
      if (roadTilesRef.current === roads) roadTilesRef.current = null;
    };
  }, [terrainStatus?.roads?.available, terrainStatus?.roads?.generation]);

  React.useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.flyTo(leafletPoint({ x: focus.locationX, z: focus.locationZ }), 1, { duration: 0.6 });
  }, [focus?.name, focus?.locationX, focus?.locationZ]);

  React.useEffect(() => {
    const controller = new AbortController();
    let events: EventSource | null = null;
    let disposed = false;
    const loader = createMapSnapshotLoader<MapSnapshot>({
      isHidden: () => document.hidden,
      onLoading: setLoading,
      load: async () => {
        const response = await fetch(request.snapshotUrl, { signal: controller.signal, credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Native map HTTP ${response.status}`);
        return payload;
      },
      onValue: (payload) => {
        if (!disposed) {
          setSnapshot(payload);
          setError("");
        }
      },
      onError: (loadError) => {
        if (!disposed && !controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : String(loadError));
      },
    });
    const connect = () => {
      if (document.hidden || disposed) return;
      events?.close();
      events = new EventSource(request.eventsUrl, { withCredentials: true });
      events.onmessage = (message) => {
        try {
          if (mapEventNeedsSnapshot(JSON.parse(message.data))) void loader.request();
        } catch {
          setError("A live map update was malformed; reconnecting.");
        }
      };
      events.onerror = () => setError((current) => current || "Live map updates are reconnecting.");
    };
    const visibility = () => {
      if (document.hidden) events?.close();
      else {
        void loader.request();
        connect();
      }
    };
    void loader.request();
    connect();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      loader.stop();
      controller.abort();
      events?.close();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [request.snapshotUrl, request.eventsUrl]);

  React.useEffect(() => {
    const markerGroups = markerGroupsRef.current;
    const focusGroup = focusGroupRef.current;
    if (!markerGroups || !focusGroup || !ordinaryRendererRef.current) return;
    for (const group of Object.values(markerGroups)) group.clearLayers();
    focusGroup.clearLayers();
    if (focus) {
      const readable = displayHexPoint({ x: focus.locationX, z: focus.locationZ });
      const focusPresentation = mapMarkerPresentation("focus");
      const focusMarker = L.marker(leafletPoint({ x: focus.locationX, z: focus.locationZ }), { icon: markerIcon("focus", focusPresentation), keyboard: true });
      focusMarker.bindTooltip(`${focus.name} · N ${readable.north}, E ${readable.east}`, { permanent: true, direction: "top" });
      focusMarker.addTo(focusGroup);
    }
    if (!snapshot) return;
    const playerColours = assignPlayerMarkerColours((snapshot.layers.players ?? []).map((feature) => String(feature.playerEntityId ?? feature.entityId)));
    for (const [layer, features] of Object.entries(snapshot.layers)) {
      if (layer === "resources" || layer === "enemies" || layer === "empire-territory") continue;
      const markerGroup = markerGroups[layer];
      if (!markerGroup) continue;
      for (const feature of features) {
        const presentation = feature.kind === "claim"
          ? claimMarkerPresentation(feature.tier)
          : mapMarkerPresentation(feature.kind);
        const tierLabel = feature.kind === "claim" && Number.isInteger(feature.tier) ? ` · Tier ${feature.tier}` : "";
        const accessibleLabel = `${featureLabel(feature)}${tierLabel} · ${displayedPoint(feature)}`;
        const marker = presentation.mode === "canvas"
          ? L.circleMarker(leafletPoint(feature.point), {
              radius: 5,
              color: FEATURE_COLORS[feature.kind] ?? "#dbe5df",
              weight: 2,
              fillOpacity: 0.85,
              renderer: ordinaryRendererRef.current,
            })
          : L.marker(leafletPoint(feature.point), { icon: markerIcon(feature.kind, presentation, playerColours[String(feature.playerEntityId ?? feature.entityId)]), pane: feature.kind === "player" ? "native-map-players" : undefined, keyboard: true, alt: accessibleLabel, title: accessibleLabel });
        marker.bindTooltip(accessibleLabel);
        marker.on("add", () => marker.getElement()?.setAttribute("aria-label", accessibleLabel));
        marker.addTo(markerGroup);
      }
    }
    resourcesRef.current?.setPoints(snapshot.layers.resources ?? []);
    enemiesRef.current?.setPoints(snapshot.layers.enemies ?? []);
  }, [snapshot, focus?.name, focus?.locationX, focus?.locationZ]);

  const accessibleFeatures = snapshot
    ? Object.entries(snapshot.layers).flatMap(([layer, features]) => {
        if (!layerVisibility[layer as MapLayerKey]) return [];
        if (layer === "empire-territory") return [];
        if (layer === "resources" || layer === "enemies") return features;
        return features.filter((feature) => (feature.kind === "claim" ? claimMarkerPresentation(feature.tier) : mapMarkerPresentation(feature.kind)).mode === "canvas");
      })
    : [];
  const layerAvailability = Object.fromEntries(MAP_LAYER_DEFINITIONS.map(({ key, available, unavailableReason, selectionRequired }) => {
    const hasSelection = !selectionRequired || (key === "resources" ? resourceIds.length > 0 : enemyTypes.length > 0);
    const selectionReason = key === "resources" ? "Select at least one resource to enable this layer." : "Select at least one enemy to enable this layer.";
    return [key, { available: available && hasSelection, reason: available && !hasSelection ? selectionReason : unavailableReason as string | null }];
  }));
  Object.assign(layerAvailability, snapshot?.layerAvailability ?? {});
  layerAvailability.roads = terrainStatus?.roads?.available
    ? { available: true, reason: null }
    : { available: false, reason: "Road tiles have not been generated for this server yet." };
  const layerCounts = Object.fromEntries(MAP_LAYER_DEFINITIONS.map(({ key, dataLayer }) => [key, dataLayer ? snapshot?.layers[dataLayer]?.length ?? 0 : null]));
  const toggleLayer = (key: MapLayerKey) => setLayerVisibility((current) => ({ ...current, [key]: !current[key] }));
  return (
    <section className="native-map-shell" aria-label="Native BitCraft map">
      <div ref={hostRef} className="native-map-canvas" role="application" aria-label="Interactive BitCraft coordinate map" tabIndex={0} />
      <MapLayersControl visibility={layerVisibility} availability={layerAvailability} counts={layerCounts} onToggle={toggleLayer} />
      <div className="native-map-status" aria-live="polite">
        <strong>{loading && !snapshot ? "Loading native map…" : snapshot ? `${snapshot.freshness} · generation ${snapshot.generation}` : "Native map unavailable"}</strong>
        {snapshot?.ageMs != null ? <span>{Math.round(snapshot.ageMs / 1000)}s old</span> : null}
        {error ? <span className="error">{error}</span> : null}
        {terrainStatus?.available ? <span>Terrain {terrainStatus.freshness} · generation {terrainStatus.generation}</span> : null}
        {terrainStatus?.roads?.available ? <span>Roads · generation {terrainStatus.roads.generation} · {terrainStatus.roads.featureCount.toLocaleString()} paving points</span> : null}
        {terrainStatus && !terrainStatus.available ? <span>{terrainStatus.buildStage === "building"
          ? "Terrain and water are building from live Relay data; showing the coordinate fallback meanwhile."
          : "Terrain/water tiles are not installed on this server; showing the coordinate fallback."}</span> : null}
        {terrainStatusError ? <span className="error">{terrainStatusError}</span> : null}
        {terrainStatus?.warnings?.map((warning) => <span key={warning}>{warning}</span>)}
        {snapshot ? <ul className="native-map-legend" aria-label="Map layer status">{Object.entries(snapshot.layers).map(([layer, features]) => <li key={layer}><span>{layer}</span><strong>{features.length}</strong><small>{layerAvailability[layer]?.available === false ? "unavailable" : layerVisibility[layer as MapLayerKey] ? snapshot.freshness : "hidden"}</small></li>)}</ul> : null}
        {snapshot?.warnings?.length ? <details><summary>{snapshot.warnings.length} data warning{snapshot.warnings.length === 1 ? "" : "s"}</summary><ul>{snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details> : null}
      </div>
      {accessibleFeatures.length ? <details className="native-map-accessible-points"><summary>{accessibleFeatures.length} canvas map points</summary><ul>{accessibleFeatures.slice(0, 250).map((feature) => <li key={`${feature.kind}:${feature.regionId}:${feature.entityId}`}>{featureLabel(feature)} at {displayedPoint(feature)}</li>)}</ul></details> : null}
    </section>
  );
}
