import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

const styleRoot = new URL("../src/styles/", import.meta.url);
const activeStyleFiles = [new URL("../src/styles.css", import.meta.url), ...readdirSync(styleRoot)
  .filter((name) => name.endsWith(".css"))
  .map((name) => new URL(name, styleRoot))];

test("active styles do not use undefined custom properties without fallbacks", () => {
  const css = activeStyleFiles.map((url) => readFileSync(url, "utf8")).join("\n");
  const declared = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]));
  const unresolved = [...css.matchAll(/var\((--[a-z0-9-]+)\)/gi)]
    .map((match) => match[1])
    .filter((name) => !declared.has(name));
  assert.deepEqual([...new Set(unresolved)].sort(), []);
});

test("overlay layers use tokens unless their current hard-coded value is explicitly approved", () => {
  const approved = [
    "app-chrome.css:.command-overlay:29",
    "app-chrome.css:.command-overlay:32",
    "craft-planning.css:.craft-plan-manager-backdrop:1400",
    "map.css:.map-player-dialog-overlay:31",
    "notifications.css:.drawer-overlay:29",
  ];
  const hardCoded = [];

  for (const url of activeStyleFiles) {
    const fileName = url.pathname.split("/").at(-1);
    const css = readFileSync(url, "utf8");
    for (const rule of css.matchAll(/(?<selector>[^{}]+)\{(?<body>[^{}]*)\}/g)) {
      const selector = rule.groups?.selector.trim() ?? "";
      if (!/[.-][a-z0-9-]*(?:overlay|backdrop)[a-z0-9-]*/i.test(selector)) continue;
      for (const zIndex of rule.groups?.body.matchAll(/z-index:\s*(-?\d+)\s*;/g) ?? []) {
        hardCoded.push(`${fileName}:${selector}:${zIndex[1]}`);
      }
    }
  }

  assert.deepEqual([...new Set(hardCoded)].sort(), approved);
});
