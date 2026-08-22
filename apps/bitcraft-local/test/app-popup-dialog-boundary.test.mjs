import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("operational popups delegate modal interaction and labelling to the shared Dialog", () => {
  const source = readFileSync(new URL("../src/components/main/AppPopupManager.tsx", import.meta.url), "utf8");

  assert.match(source, /import \{ Dialog \} from "\.\/Dialog"/);
  assert.match(source, /<Dialog\b/);
  assert.match(source, /titleElementId="app-popup-title"/);
  assert.match(source, /<h2 id="app-popup-title">/);
  assert.match(source, /onClose=\{[^}]*dismiss\("ok"\)/);
  assert.doesNotMatch(source, /role="dialog"|aria-modal=/);
});

test("shared Dialog can keep a required operational message open without weakening dismissible dialogs", () => {
  const source = readFileSync(new URL("../src/components/main/Dialog.tsx", import.meta.url), "utf8");

  assert.match(source, /dismissible\?: boolean/);
  assert.match(source, /if \(event\.key === "Escape" && dismissible\)/);
  assert.match(source, /closeOnBackdrop && dismissible/);
  assert.match(source, /aria-labelledby=\{titleElementId \?\? titleId\}/);
});
