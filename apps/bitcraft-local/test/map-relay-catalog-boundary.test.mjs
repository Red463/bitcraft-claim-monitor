import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Map Resource Finder reads the continuously maintained Relay catalog", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const mapPage = readFileSync(new URL("../src/pages/MapPage.tsx", import.meta.url), "utf8");
  const routeStart = server.indexOf('url.pathname === "/api/local/map/catalog"');
  const routeEnd = server.indexOf('url.pathname.startsWith("/api/local/branding/")', routeStart);
  const route = server.slice(routeStart, routeEnd);

  assert.match(route, /providerCatalogRepository\.listDescriptions\("resource"\)/);
  assert.match(route, /providerCatalogRepository\.listDescriptions\("enemy"\)/);
  assert.doesNotMatch(route, /fetchMapCatalog|fetchBitjita/);
  assert.doesNotMatch(server, /let mapCatalogCache|async function fetchMapCatalog/);
  assert.doesNotMatch(mapPage, /Loading resources from BitJita/);
});
