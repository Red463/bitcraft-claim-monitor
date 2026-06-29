import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("AppShell delegates admin console rendering to a focused admin component", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const adminPanelUrl = new URL("../src/components/admin/AdminPanel.tsx", import.meta.url);

  assert.equal(existsSync(adminPanelUrl), true, "AdminPanel component should exist");
  const adminPanel = readFileSync(adminPanelUrl, "utf8");

  assert.match(appShell, /import \{ AdminPanel \} from "\.\/components\/admin\/AdminPanel";/);
  assert.doesNotMatch(appShell, /function AdminPanel\b/);
  assert.doesNotMatch(appShell, /type AdminTab\b/);
  assert.match(adminPanel, /export function AdminPanel\b/);
  assert.match(adminPanel, /type AdminPanelProps = \{/);
});
