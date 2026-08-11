import React from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { MAP_HEX_APOTHEM, MAP_WORLD_BOUNDS, displayHexPoint, gridTileOrigin, leafletPoint } from "./mapCoordinates.mjs";
import { nativeMapRequest } from "./nativeMapRequest.mjs";
import type { MapFocus } from "./mapUtils";

type MapPoint = { x: number; z: number; dimension: string; coordinateSpace: string };
type MapFeature = {
  kind: string;
  entityId: string;
  regionId?: string;
  name?: string;
  identity?: string;
  point: MapPoint;
};
type MapSnapshot = {
  generation: string;
  generatedAt: string;
  freshness: "live" | "partial" | "stale" | "unavailable";
  ageMs: number | null;
  warnings: string[];
  layers: Record<string, MapFeature[]>;
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

  constructor(color: string) {
    super();
    this.#color = color;
  }

  setPoints(points: MapFeature[]) {
    this.#points = points;
    this.#scheduleDraw();
  }

  onAdd(map: L.Map) {
    this.#map = map;
    this.#canvas = L.DomUtil.create("canvas", "leaflet-zoom-animated native-map-dense-canvas") as HTMLCanvasElement;
    map.getPanes().overlayPane.appendChild(this.#canvas);
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
    if (!this.#map || !this.#canvas) return;
    const size = this.#map.getSize();
    const topLeft = this.#map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this.#canvas, topLeft);
    this.#canvas.width = size.x;
    this.#canvas.height = size.y;
    const context = this.#canvas.getContext("2d");
    if (!context) return;
    const bounds = this.#map.getBounds().pad(0.1);
    const visible = this.#points.filter((point) => bounds.contains(leafletPoint(point.point)));
    const stride = Math.max(1, Math.ceil(visible.length / 25_000));
    context.fillStyle = this.#color;
    for (let index = 0; index < visible.length; index += stride) {
      const pixel = this.#map.latLngToContainerPoint(leafletPoint(visible[index].point));
      context.beginPath();
      context.arc(pixel.x, pixel.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }
}

const FEATURE_COLORS: Record<string, string> = {
  claim: "#f0c64f",
  market: "#68d7ff",
  bank: "#83e3a5",
  waystone: "#c7a5ff",
  "empire-settlement": "#ff9b71",
  watchtower: "#ff6b6b",
  player: "#ffffff",
};

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
  const markersRef = React.useRef<L.LayerGroup | null>(null);
  const resourcesRef = React.useRef<DensePointLayer | null>(null);
  const enemiesRef = React.useRef<DensePointLayer | null>(null);
  const [snapshot, setSnapshot] = React.useState<MapSnapshot | null>(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [terrainStatus, setTerrainStatus] = React.useState<"unknown" | "available" | "missing">("unknown");
  const request = React.useMemo(() => nativeMapRequest({ regionIds, playerIds, resourceIds, enemyTypes }), [regionIds.join(","), playerIds.join(","), resourceIds.join(","), enemyTypes.join(",")]);

  React.useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, { crs: NATIVE_CRS, minZoom: -5, maxZoom: 5, zoomControl: true, preferCanvas: true, attributionControl: false });
    const bounds = L.latLngBounds([MAP_WORLD_BOUNDS.minZ, MAP_WORLD_BOUNDS.minX], [MAP_WORLD_BOUNDS.maxZ, MAP_WORLD_BOUNDS.maxX]);
    map.setView([19_200, 19_200], -4);
    map.setMaxBounds(bounds.pad(0.25));
    new CoordinateGridLayer({ tileSize: 256, noWrap: false }).addTo(map);
    let terrainTileLoaded = false;
    const terrainTiles = L.tileLayer("/api/local/map/tiles/terrain/{z}/{x}/{y}.webp", {
      tileSize: 256,
      minNativeZoom: -5,
      maxNativeZoom: 0,
      noWrap: false,
      keepBuffer: 2,
    });
    terrainTiles.on("tileload", () => {
      terrainTileLoaded = true;
      setTerrainStatus("available");
    });
    terrainTiles.on("tileerror", () => {
      if (!terrainTileLoaded) setTerrainStatus("missing");
    });
    terrainTiles.addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    resourcesRef.current = new DensePointLayer("rgba(87, 225, 151, 0.9)").addTo(map);
    enemiesRef.current = new DensePointLayer("rgba(255, 112, 112, 0.92)").addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      resourcesRef.current = null;
      enemiesRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (!focus || !mapRef.current) return;
    mapRef.current.flyTo(leafletPoint({ x: focus.locationX, z: focus.locationZ }), 1, { duration: 0.6 });
  }, [focus?.name, focus?.locationX, focus?.locationZ]);

  React.useEffect(() => {
    const controller = new AbortController();
    let events: EventSource | null = null;
    let disposed = false;
    const load = async () => {
      if (document.hidden) return;
      setLoading(true);
      try {
        const response = await fetch(request.snapshotUrl, { signal: controller.signal, credentials: "same-origin" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || `Native map HTTP ${response.status}`);
        if (!disposed) {
          setSnapshot(payload);
          setError("");
        }
      } catch (loadError) {
        if (!disposed && !controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    const connect = () => {
      if (document.hidden || disposed) return;
      events?.close();
      events = new EventSource(request.eventsUrl, { withCredentials: true });
      events.onmessage = () => void load();
      events.onerror = () => setError((current) => current || "Live map updates are reconnecting.");
    };
    const visibility = () => {
      if (document.hidden) events?.close();
      else {
        void load();
        connect();
      }
    };
    void load();
    connect();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      controller.abort();
      events?.close();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [request.snapshotUrl, request.eventsUrl]);

  React.useEffect(() => {
    const markers = markersRef.current;
    if (!markers) return;
    markers.clearLayers();
    if (focus) {
      const readable = displayHexPoint({ x: focus.locationX, z: focus.locationZ });
      const focusMarker = L.circleMarker(leafletPoint({ x: focus.locationX, z: focus.locationZ }), {
        radius: 8,
        color: "#f0c64f",
        weight: 3,
        fillColor: "#0e1517",
        fillOpacity: 1,
      });
      focusMarker.bindTooltip(`${focus.name} · N ${readable.north}, E ${readable.east}`, { permanent: true, direction: "top" });
      focusMarker.addTo(markers);
    }
    if (!snapshot) return;
    for (const [layer, features] of Object.entries(snapshot.layers)) {
      if (layer === "resources" || layer === "enemies" || layer === "empire-territory") continue;
      for (const feature of features) {
        const marker = L.circleMarker(leafletPoint(feature.point), {
          radius: feature.kind === "player" ? 6 : 5,
          color: FEATURE_COLORS[feature.kind] ?? "#dbe5df",
          weight: 2,
          fillOpacity: 0.85,
          renderer: L.canvas(),
        });
        marker.bindTooltip(`${featureLabel(feature)} · ${displayedPoint(feature)}`);
        marker.addTo(markers);
      }
    }
    resourcesRef.current?.setPoints(snapshot.layers.resources ?? []);
    enemiesRef.current?.setPoints(snapshot.layers.enemies ?? []);
  }, [snapshot, focus?.name, focus?.locationX, focus?.locationZ]);

  const denseFeatures = [...(snapshot?.layers.resources ?? []), ...(snapshot?.layers.enemies ?? [])];
  return (
    <section className="native-map-shell" aria-label="Native BitCraft map">
      <div ref={hostRef} className="native-map-canvas" role="application" aria-label="Interactive BitCraft coordinate map" tabIndex={0} />
      <div className="native-map-status" aria-live="polite">
        <strong>{loading && !snapshot ? "Loading native map…" : snapshot ? `${snapshot.freshness} · generation ${snapshot.generation}` : "Native map unavailable"}</strong>
        {snapshot?.ageMs != null ? <span>{Math.round(snapshot.ageMs / 1000)}s old</span> : null}
        {error ? <span className="error">{error}</span> : null}
        {terrainStatus === "missing" ? <span>Terrain/water tiles are not installed on this server; showing the coordinate fallback.</span> : null}
        {snapshot ? <ul className="native-map-legend" aria-label="Map layer status">{Object.entries(snapshot.layers).map(([layer, features]) => <li key={layer}><span>{layer}</span><strong>{features.length}</strong><small>{snapshot.freshness}</small></li>)}</ul> : null}
        {snapshot?.warnings?.length ? <details><summary>{snapshot.warnings.length} data warning{snapshot.warnings.length === 1 ? "" : "s"}</summary><ul>{snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details> : null}
      </div>
      {denseFeatures.length ? <details className="native-map-accessible-points"><summary>{denseFeatures.length} dense map points</summary><ul>{denseFeatures.slice(0, 250).map((feature) => <li key={`${feature.kind}:${feature.entityId}`}>{featureLabel(feature)} at {displayedPoint(feature)}</li>)}</ul></details> : null}
    </section>
  );
}
