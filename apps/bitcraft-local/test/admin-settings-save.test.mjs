import assert from "node:assert/strict";
import test from "node:test";

import {
  applyBrandingSettingsResult,
  applyConfirmedSettingsSave,
  syncDraftFromPersistedSettings,
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

test("parent settings updates retain a dirty branding draft and later invalidate only after the real claim save", () => {
  const persisted = settings("claim-a", { logo: null });
  const dirtyDraft = { ...settings("claim-b", { logo: null }), theme: { density: "compact" }, refreshSeconds: 45 };
  const branding = { logo: { url: "/api/local/branding/logo" } };
  const brandingResult = applyBrandingSettingsResult(persisted, dirtyDraft, branding);
  const parentAfterBranding = brandingResult.savedSettings;
  const draftAfterParentUpdate = syncDraftFromPersistedSettings(persisted, parentAfterBranding, brandingResult.nextDraft);

  assert.deepEqual(draftAfterParentUpdate, { ...dirtyDraft, branding });
  assert.equal(parentAfterBranding.claimId, "claim-a");

  const events = [];
  const persistedClaimSave = draftAfterParentUpdate;
  applyConfirmedSettingsSave({
    previousSettings: parentAfterBranding,
    persistedSettings: persistedClaimSave,
    onSettingsSaved: (next) => events.push(["settings", next.claimId]),
    onClaimSettingsSaved: (previousClaimId, next) => events.push(["claim", previousClaimId, next.claimId]),
  });
  const draftAfterClaimParentUpdate = syncDraftFromPersistedSettings(parentAfterBranding, persistedClaimSave, persistedClaimSave);

  assert.deepEqual(draftAfterClaimParentUpdate, persistedClaimSave);
  assert.deepEqual(events, [["settings", "claim-b"], ["claim", "claim-a", "claim-b"]]);
});

test("a clean draft adopts an external settings refresh", () => {
  const previous = settings("claim-a", { logo: null });
  const refreshed = { ...settings("claim-a", { logo: { url: "/api/local/branding/logo" } }), refreshSeconds: 30 };

  assert.deepEqual(syncDraftFromPersistedSettings(previous, refreshed, previous), refreshed);
});
