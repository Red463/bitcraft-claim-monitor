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

test("Native map projection preserves X and squishes only Leaflet Y", () => {
  const nativeMap = readFileSync(new URL("../src/pages/map/NativeMap.tsx", import.meta.url), "utf8");

  assert.match(nativeMap, /new L\.Point\(latlng\.lng, -latlng\.lat \/ MAP_HEX_APOTHEM\)/);
  assert.match(nativeMap, /new L\.LatLng\(-projected\.y \* MAP_HEX_APOTHEM, projected\.x\)/);
  assert.match(nativeMap, /new L\.Transformation\(1, 0, 1, 0\)/);
});

