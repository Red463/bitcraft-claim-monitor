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

test("AdminPanel groups admin tabs by operational purpose", () => {
  const adminPanel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");

  assert.match(adminPanel, /const ADMIN_TAB_GROUPS\s*:/);
  assert.match(adminPanel, /Operations/);
  assert.match(adminPanel, /Insights/);
  assert.match(adminPanel, /Access/);
  assert.match(adminPanel, /Maintenance/);
  assert.match(adminPanel, /admin-tab-group/);
});
test("AdminPanel keeps sensitive admin controls explicit", () => {
  const adminPanel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");

  assert.match(adminPanel, /Delete all opt-in usage analytics records/);
  assert.match(adminPanel, /Start this background job now without changing its saved schedule/);
  assert.match(adminPanel, /Save this job schedule\. It does not run the job immediately/);
  assert.match(adminPanel, /Create an admin allow-list entry/);
  assert.match(adminPanel, /Sign this administrator out of all active sessions/);
  assert.match(adminPanel, /Create a downloadable SQLite backup/);
  assert.match(adminPanel, /No administrator accounts are configured yet/);
  assert.match(adminPanel, /No administrator actions have been recorded yet/);
  assert.match(adminPanel, /No database backups have been created yet/);
});
test("Admin diagnostics and collector settings stay bounded", () => {
  const adminCss = readFileSync(new URL("../src/styles/admin.css", import.meta.url), "utf8");

  assert.match(adminCss, /\.map-url-diagnostics code \{/);
  assert.match(adminCss, /max-height:\s*150px/);
  assert.match(adminCss, /overflow-wrap:\s*anywhere/);
  assert.match(adminCss, /\.map-url-log-list \{/);
  assert.match(adminCss, /max-height:\s*220px/);
  assert.match(adminCss, /\.collector-setting-row \{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});