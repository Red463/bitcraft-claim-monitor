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
  assert.equal(appShell.includes('import { MapPanel } from "./pages/MapPage";'), true);
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

