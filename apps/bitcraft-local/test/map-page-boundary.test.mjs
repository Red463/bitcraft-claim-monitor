import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("Map page lives outside the legacy MainPages bundle", () => {
  const mainPagesUrl = new URL("../src/pages/MainPages.tsx", import.meta.url);
  const mainPages = existsSync(mainPagesUrl) ? readFileSync(mainPagesUrl, "utf8") : "";
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const mapPageUrl = new URL("../src/pages/MapPage.tsx", import.meta.url);

  assert.equal(existsSync(mapPageUrl), true);
  assert.doesNotMatch(mainPages, new RegExp("export function MapPanel\\b"));
  assert.match(appShell, /React\.lazy\(\(\) => import\("\.\/pages\/MapPage"\)/);
});

test("Map iframe host exposes loading, timeout, failure, retry, and full-page recovery", () => {
  const mapPage = readFileSync(new URL("../src/pages/MapPage.tsx", import.meta.url), "utf8");

  assert.match(mapPage, /type FrameState = "loading" \| "ready" \| "timed-out" \| "failed"/);
  assert.match(mapPage, /Loading embedded map/);
  assert.match(mapPage, /taking longer than expected/);
  assert.match(mapPage, /onLoad=/);
  assert.match(mapPage, /onError=/);
  assert.match(mapPage, /Retry/);
  assert.match(mapPage, /Open full page/);
});

test("Map page exposes compact player tracking controls", () => {
  const mapPage = readFileSync(new URL("../src/pages/MapPage.tsx", import.meta.url), "utf8");

  assert.match(mapPage, /usePersistedState<string\[\] \| null>\("map\.players", null\)/);
  assert.match(mapPage, /MapPlayerTrackingControls/);
  assert.match(mapPage, /Manage players/);
  assert.match(mapPage, /Track online/);
  assert.doesNotMatch(mapPage, /roster\.map\(\(player\) => \{/);
});
test("Map iframe is not remounted on every generated URL refresh", () => {
  const mapPage = readFileSync(new URL("../src/pages/MapPage.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(mapPage, /<iframe\s+key=\{currentFrameUrl\}/);
  assert.match(mapPage, /const \[currentFrameUrl, setCurrentFrameUrl\] = React\.useState\(mapUrl\)/);
  assert.match(mapPage, /mapSignature/);
});

test("Map iframe URL updates when auto-online tracked players change", () => {
  const mapPage = readFileSync(new URL("../src/pages/MapPage.tsx", import.meta.url), "utf8");

  assert.match(mapPage, /const currentPlayerIds = React\.useMemo\(\(\) => \[\.\.\.current\]\.sort\(\), \[current\]\)/);
  assert.match(mapPage, /playerIds: currentPlayerIds/);
  assert.match(mapPage, /bitcraftMapUrl\(currentPlayerIds,/);
  assert.match(mapPage, /setCurrentFrameUrl\(\(previousUrl\) => previousUrl === mapUrl \? previousUrl : mapUrl\)/);
  assert.doesNotMatch(mapPage, /autoFramePlayerIds/);
});

test("Map player tracking controls wrap within phone-width panels", () => {
  const mapCss = readFileSync(new URL("../src/styles/map.css", import.meta.url), "utf8");

  assert.match(
    mapCss,
    /@media \(max-width:\s*620px\)[\s\S]*\.map-player-tracking\s*\{[^}]*flex-wrap:\s*wrap/s,
  );
});

test("Map Resource Finder uses the shared icon fallback for compound item identities", () => {
  const mapPage = readFileSync(new URL("../src/pages/MapPage.tsx", import.meta.url), "utf8");

  assert.match(mapPage, /import \{ ItemIcon \} from "\.\.\/components\/main\/ItemDisplay"/);
  assert.match(mapPage, /itemType:\s*resource\.itemType/);
  assert.match(mapPage, /itemId:\s*resource\.itemId/);
  assert.match(mapPage, /iconAssetName:\s*resource\.iconAssetName/);
  assert.match(mapPage, /<ItemIcon item=\{resourceIcon\} \/>/);
  assert.doesNotMatch(mapPage, /const iconUrl = gameIconUrl\(resource\)/);
});

test("Map Resource Finder bounds rendered rows and reveals deterministic batches", () => {
  const mapPage = readFileSync(new URL("../src/pages/MapPage.tsx", import.meta.url), "utf8");

  assert.match(mapPage, /import \{ RESOURCE_FINDER_BATCH_SIZE, nextResourceLimit, visibleResourceMatches \} from "\.\/map\/resourceFinderWindow\.mjs"/);
  assert.match(mapPage, /useState<number>\(RESOURCE_FINDER_BATCH_SIZE\)/);
  assert.match(mapPage, /setResourceVisibleLimit\(RESOURCE_FINDER_BATCH_SIZE\)/);
  assert.match(mapPage, /\[resourceSearch, resourceTier, resourceCategory\]/);
  assert.match(mapPage, /const renderedResources = React\.useMemo/);
  assert.match(mapPage, /visibleResourceMatches\(visibleResources, resourceVisibleLimit\)/);
  assert.match(mapPage, /renderedResources\.map\(\(resource\) =>/);
  assert.match(mapPage, /Showing \{renderedResources\.length\} of \{visibleResources\.length\}/);
  assert.match(mapPage, /nextResourceLimit\(current, visibleResources\.length\)/);
  assert.match(mapPage, />Show more</);
});

test("Native map projection preserves X and squishes only Leaflet Y", () => {
  const nativeMap = readFileSync(new URL("../src/pages/map/NativeMap.tsx", import.meta.url), "utf8");

  assert.match(nativeMap, /new L\.Point\(latlng\.lng, -latlng\.lat \/ MAP_HEX_APOTHEM\)/);
  assert.match(nativeMap, /new L\.LatLng\(-projected\.y \* MAP_HEX_APOTHEM, projected\.x\)/);
  assert.match(nativeMap, /new L\.Transformation\(1, 0, 1, 0\)/);
});

test("Native map renders the current waypoint as a visible first-party marker", () => {
  const nativeMap = readFileSync(new URL("../src/pages/map/NativeMap.tsx", import.meta.url), "utf8");

  assert.match(nativeMap, /focusMarker/);
  assert.match(nativeMap, /leafletPoint\(\{ x: focus\.locationX, z: focus\.locationZ \}\)/);
  assert.match(nativeMap, /bindTooltip\(`\$\{focus\.name\}/);
});

test("Native map reuses one canvas renderer and fixed marker presentations", () => {
  const nativeMap = readFileSync(new URL("../src/pages/map/NativeMap.tsx", import.meta.url), "utf8");

  assert.match(nativeMap, /const ordinaryRendererRef = React\.useRef<L\.Canvas \| null>\(null\)/);
  assert.equal((nativeMap.match(/L\.canvas\(\{ padding: 0\.25 \}\)/g) ?? []).length, 1);
  assert.match(nativeMap, /ordinaryRendererRef\.current = L\.canvas\(\{ padding: 0\.25 \}\)/);
  assert.match(nativeMap, /renderer: ordinaryRendererRef\.current/);
  assert.doesNotMatch(nativeMap, /renderer: L\.canvas\(\)/);
  assert.match(nativeMap, /mapMarkerPresentation\(feature\.kind\)/);
  assert.match(nativeMap, /L\.divIcon\(/);
  assert.match(nativeMap, /planDensePointDraw\(this\.#points,/);
  assert.match(nativeMap, /const accessibleFeatures =/);
  assert.match(nativeMap, /presentation\.mode === "canvas"/);
  assert.match(nativeMap, /accessibleFeatures\.slice\(0, 250\)/);
  assert.match(nativeMap, /feature\.kind === "claim"\s*\? claimMarkerPresentation\(feature\.tier\)/);
  assert.match(nativeMap, /keyboard: true/);
});

test("Native map requests only same-origin locally provisioned terrain tiles", () => {
  const nativeMap = readFileSync(new URL("../src/pages/map/NativeMap.tsx", import.meta.url), "utf8");
  assert.match(nativeMap, /mapTileUrl\("terrain", terrainStatus\.generation\)/);
  assert.match(nativeMap, /mapTileUrl\("water", terrainStatus\.generation\)/);
  assert.match(nativeMap, /mapTileUrl\("roads", roadStatus\.generation\)/);
  assert.match(nativeMap, /roadTilesRef/);
  assert.match(nativeMap, /loadTerrainTileStatus/);
  assert.match(nativeMap, /visibilitychange/);
  assert.match(nativeMap, /60_000/);
  assert.match(nativeMap, /minNativeZoom: -5/);
  assert.match(nativeMap, /maxNativeZoom: 0/);
  assert.doesNotMatch(nativeMap, /layerVisibility\.terrain|layerVisibility\.water/);
  assert.match(nativeMap, /L\.map\(hostRef\.current, \{ crs: NATIVE_CRS, minZoom: -6, maxZoom: 5,/);
  assert.match(nativeMap, /const tileOptions = \{\s*tileSize: 256,\s*minZoom: -6,\s*maxZoom: 5,\s*minNativeZoom: -5,/);
  assert.doesNotMatch(nativeMap, /prism\.brico\.app|bitcraftmap\.com/);
  assert.match(nativeMap, /Terrain\/water tiles are not installed on this server/);
  assert.ok(nativeMap.indexOf("new CoordinateGridLayer") < nativeMap.indexOf('mapTileUrl("terrain", terrainStatus.generation)'));
});

test("Native map browser source excludes bank tracking and remote map assets", () => {
  const sources = [
    readFileSync(new URL("../src/pages/map/NativeMap.tsx", import.meta.url), "utf8"),
    readFileSync(new URL("../src/pages/map/nativeMapRequest.mjs", import.meta.url), "utf8"),
    readFileSync(new URL("../src/pages/map/mapMarkerPresentation.mjs", import.meta.url), "utf8"),
  ].join("\n");

  assert.doesNotMatch(sources, /["']banks?["']/i);
  assert.doesNotMatch(sources, /https?:\/\//i);
  assert.doesNotMatch(sources, /renderer:\s*L\.canvas\(\)/);
});

test("Native map exposes persisted layer controls without clearing dense selections", () => {
  const nativeMap = readFileSync(new URL("../src/pages/map/NativeMap.tsx", import.meta.url), "utf8");
  const control = readFileSync(new URL("../src/pages/map/MapLayersControl.tsx", import.meta.url), "utf8");

  assert.match(nativeMap, /loadMapLayerVisibility\(\(\) => window\.localStorage\)/);
  assert.match(nativeMap, /saveMapLayerVisibility\(\(\) => window\.localStorage, layerVisibility\)/);
  assert.match(nativeMap, /setVisible\(layerVisibility\.resources\)/);
  assert.match(nativeMap, /setVisible\(layerVisibility\.enemies\)/);
  assert.match(nativeMap, /<MapLayersControl/);
  assert.doesNotMatch(control, /setResourceIds|setEnemyTypes|resourceIds\s*=|enemyTypes\s*=/);
  assert.match(control, /aria-describedby/);
  assert.match(control, />Layers</);
  assert.match(nativeMap, /alt: accessibleLabel, title: accessibleLabel/);
  assert.match(nativeMap, /setAttribute\("aria-label", accessibleLabel\)/);
  assert.match(nativeMap, /zoomend/);
  assert.match(nativeMap, /--native-map-claim-scale/);
  const css = readFileSync(new URL("../src/styles/map.css", import.meta.url), "utf8");
  assert.match(css, /native-map-marker--claim[^}]*width:\s*40px[^}]*height:\s*40px/s);
  assert.match(css, /badge-crop[^}]*padding:\s*3px/s);
  assert.match(nativeMap, /selectionRequired.*resourceIds\.length.*enemyTypes\.length/s);
});

test("Native map separates event and snapshot limits and ignores the initial stream event", () => {
  const nativeMap = readFileSync(new URL("../src/pages/map/NativeMap.tsx", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(nativeMap, /mapEventNeedsSnapshot/);
  assert.match(nativeMap, /createMapSnapshotLoader/);
  assert.match(server, /"map-snapshot", RATE_LIMITS\.mapSnapshot/);
  assert.match(server, /"map-events", RATE_LIMITS\.mapEvents/);
  assert.match(server, /initial: true/);
});

test("configured-region resource and verified player tracking are enabled without enabling unverified enemy identities", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.match(server, /const MAP_RESOURCE_COORDINATES_VERIFIED = true/);
  assert.match(server, /const MAP_SPATIAL_COLLECTION_VERIFIED = true/);
  assert.match(server, /const MAP_PLAYER_MOBILE_IDENTITY_VERIFIED = true/);
  assert.match(server, /const MAP_ENEMY_IDENTITY_VERIFIED = false/);
  assert.match(server, /const spatialCollectionRequested = .*permittedPlayerIds\.length.*scope\.resourceIds\.length/s);
});

