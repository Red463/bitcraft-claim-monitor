import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Obsidian Ledger exposes one semantic token layer and contextual modes", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  for (const token of [
    "--canvas", "--surface-1", "--surface-2", "--surface-3", "--line-subtle",
    "--line-strong", "--signal-info", "--signal-discord", "--space-1", "--space-6",
    "--radius-panel", "--radius-dialog", "--font-data",
  ]) assert.match(styles, new RegExp(`${token}:`), token);
  for (const mode of ["operations", "market", "public", "admin", "bot"]) {
    assert.match(styles, new RegExp(`\\.surface-mode-${mode}\\s*\\{`), mode);
  }
  assert.match(styles, /\.panel\s*\{[^}]*gap:\s*var\(--workspace-density/s);
  assert.match(styles, /\.page-view > \.panel\s*\{[^}]*var\(--workspace-accent/s);
});

test("application tools live in an anchored utility component", () => {
  const utility = readFileSync(new URL("../src/components/main/AppUtilityBar.tsx", import.meta.url), "utf8");
  assert.match(utility, /aria-label="Application tools"/);
  for (const label of ["Search commands", "Admin console", "Updates", "Browser settings", "Help and application information"]) {
    assert.match(utility, new RegExp(label));
  }
  assert.match(utility, /aria-busy=\{refreshing\}/);
  assert.match(utility, /disabled=\{refreshDisabled\}/);
});
