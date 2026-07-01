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
test("Admin console uses compact navigation and bounded audit tools", () => {
  const adminPanel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
  const adminCss = readFileSync(new URL("../src/styles/admin.css", import.meta.url), "utf8");

  assert.match(adminPanel, /admin-section-tabs/);
  assert.match(adminPanel, /admin-tab-overview/);
  assert.match(adminCss, /admin-nav-divider/);
  assert.match(adminPanel, /setAuditFilter/);
  assert.match(adminPanel, /filteredAuditLog/);
  assert.match(adminPanel, /auditData\.auditLog\.length > auditVisibleCount/);
  assert.match(adminPanel, /Load more actions/);
  assert.match(adminCss, /\.admin-tab-groups\s*\{[\s\S]*display:\s*flex/);
  assert.doesNotMatch(adminCss, /\.admin-section-tabs\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(adminCss, /\.audit-table/);
});

test("Admin diagnostics exposes support-oriented health tools", () => {
  const adminPanel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");

  assert.match(adminPanel, /Support snapshot/);
  assert.match(adminPanel, /Copy Support Snapshot/);
  assert.match(adminPanel, /Runtime/);
  assert.match(adminPanel, /Public popup count/);
  assert.match(adminPanel, /Local API health/);
});

test("App popup admin uses a compact list and modal editor", () => {
  const popupsSection = readFileSync(new URL("../src/components/admin/AdminPopupsSection.tsx", import.meta.url), "utf8");
  const adminCss = readFileSync(new URL("../src/styles/admin.css", import.meta.url), "utf8");

  assert.match(popupsSection, /popupEditorOpen/);
  assert.match(popupsSection, /openPopupEditor/);
  assert.match(popupsSection, /Save Popup/);
  assert.match(popupsSection, /admin-modal-backdrop/);
  assert.match(popupsSection, /popup-admin-table/);
  assert.doesNotMatch(popupsSection, /popup-builder-grid/);
  assert.match(adminCss, /\.admin-modal-backdrop/);
  assert.match(adminCss, /\.popup-admin-table/);
});
test("App popup admin table fits its card without horizontal scrolling", () => {
  const adminCss = readFileSync(new URL("../src/styles/admin.css", import.meta.url), "utf8");

  assert.doesNotMatch(adminCss, /\.popup-admin-table\s*\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(adminCss, /\.popup-admin-table-row\s*\{[^}]*min-width:\s*\d+px/);
  assert.match(adminCss, /\.popup-message-preview/);
});

