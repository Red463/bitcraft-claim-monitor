import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("dashboard history no longer carries an unused snapshots state or prop", () => {
  const appShell = source("../src/AppShell.tsx");
  const dashboardPage = source("../src/pages/DashboardPage.tsx");
  const localHistory = source("../src/api/localHistory.ts");
  const appTypes = source("../src/types/app.ts");

  assert.doesNotMatch(appShell, /<Dashboard\b[^>]*\bsnapshots=/);
  assert.doesNotMatch(dashboardPage, /\bsnapshots\b/);
  assert.doesNotMatch(localHistory, /\bsnapshots\s*:|history\.snapshots/);
  assert.doesNotMatch(appTypes, /\bsnapshots\s*:/);
});

test("admin surfaces no longer expose snapshot counts, retention, or pruning", () => {
  const adminPanel = source("../src/components/admin/AdminPanel.tsx");
  const serverHealth = source("../src/components/admin/ServerHealthSection.tsx");

  assert.doesNotMatch(adminPanel, /Remove Expired Snapshots/);
  assert.doesNotMatch(adminPanel, /Snapshot retention/);
  assert.doesNotMatch(adminPanel, /snapshotRetentionDays/);
  assert.doesNotMatch(adminPanel, /maintenance\/prune/);
  assert.doesNotMatch(adminPanel, /counts\?\.snapshots/);
  assert.doesNotMatch(adminPanel, /label="Snapshots"/);
  assert.doesNotMatch(serverHealth, /counts\?\.snapshots/);
});

test("frontend settings and collector copy no longer describe snapshot history", () => {
  const adminDisplay = source("../src/components/admin/adminDisplay.ts");
  const settingsDefaults = source("../src/settingsDefaults.ts");
  const settingsTypes = source("../src/types/settings.ts");

  assert.doesNotMatch(adminDisplay, /snapshotHistory|settlement snapshots/);
  assert.doesNotMatch(settingsDefaults, /snapshotHistory|snapshotRetentionDays/);
  assert.doesNotMatch(settingsTypes, /snapshotRetentionDays/);
});
