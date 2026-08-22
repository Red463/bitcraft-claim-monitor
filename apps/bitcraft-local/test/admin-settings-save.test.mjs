import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBrandingSettingsResult,
  applyConfirmedSettingsSave,
} from "../src/components/admin/adminSettingsSave.ts";

function settings(claimId, branding = {}) {
  return { claimId, branding, theme: {}, discord: {}, toastSettings: {} };
}

test("a branding save preserves the persisted claim despite an unsaved claim draft", () => {
  const persisted = settings("claim-a", { logo: null });
  const draft = settings("claim-b", { logo: null });
  const result = applyBrandingSettingsResult(persisted, draft, { logo: { url: "/api/local/branding/logo" } });

  assert.equal(result.savedSettings.claimId, "claim-a");
  assert.equal(result.nextDraft.claimId, "claim-b");
  assert.deepEqual(result.savedSettings.branding, { logo: { url: "/api/local/branding/logo" } });
});

test("only a successful persisted settings response for a changed claim triggers claim cache invalidation", () => {
  const events = [];
  const persisted = settings("claim-a");
  const saved = settings("claim-b");

  applyConfirmedSettingsSave({
    previousSettings: persisted,
    persistedSettings: saved,
    onSettingsSaved: (next) => events.push(["settings", next.claimId]),
    onClaimSettingsSaved: (previousClaimId, nextSettings) => events.push(["claim", previousClaimId, nextSettings.claimId]),
  });

  assert.deepEqual(events, [
    ["settings", "claim-b"],
    ["claim", "claim-a", "claim-b"],
  ]);
});
