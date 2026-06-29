import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("admin display helpers live outside the AdminPanel component", async () => {
  const helperUrl = new URL("../src/components/admin/adminDisplay.ts", import.meta.url);
  const adminPanel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");

  assert.equal(existsSync(helperUrl), true, "adminDisplay helper module should exist");
  assert.match(adminPanel, /from "\.\/adminDisplay"/);
  assert.doesNotMatch(adminPanel, /function bytesLabel\b/);
  assert.doesNotMatch(adminPanel, /function discordAuditActionLabel\b/);
  assert.doesNotMatch(adminPanel, /function scheduledJobProgressText\b/);

  const helpers = await import(helperUrl.href);
  assert.equal(helpers.bytesLabel(512), "512 B");
  assert.equal(helpers.bytesLabel(1536), "1.5 KB");
  assert.equal(helpers.bytesLabel(2 * 1024 * 1024), "2.0 MB");
  assert.equal(helpers.collectorStatusValue({ running: true, progressCurrent: 3, progressTotal: 10 }), "Running (3 / 10)");
  assert.equal(helpers.collectorStatusValue({ lastError: "timeout" }), "Error: timeout");
  assert.equal(helpers.collectorStatusValue({ lastSuccessAt: "2026-06-29T10:00:00Z" }), "Last success 2026-06-29T10:00:00Z");
  assert.equal(helpers.scheduledJobProgressText({ stage: "sync_market", current: 5, total: 8, updated: 2 }), "sync market (5 / 8 checked ? 2 updated)");
  assert.equal(helpers.discordAuditActionLabel(30), "Role created");
  assert.equal(helpers.discordAuditActionLabel(null), "Action unknown");
  assert.equal(helpers.discordAuditUserLabel([{ id: "1", username: "red" }], "1"), "red");
  assert.equal(helpers.discordChangeLabel({ key: "allow_list", new_value: ["a", "b"] }), "allow list: 2 items");
});
