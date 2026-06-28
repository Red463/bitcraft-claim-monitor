import assert from "node:assert/strict";
import test from "node:test";

import { normalizeNotificationSoundSettings, normalizeUserToastSettings } from "../src/notifications/userToastSettings.ts";

test("normalizeNotificationSoundSettings falls back for missing or corrupted saved sound settings", () => {
  assert.deepEqual(normalizeNotificationSoundSettings(null), {
    soundEnabled: true,
    soundId: "alert-pop",
    soundVolume: 0.55,
  });
  assert.deepEqual(normalizeNotificationSoundSettings({ soundEnabled: "no", soundId: "unknown-tone", soundVolume: Number.NaN }), {
    soundEnabled: true,
    soundId: "alert-pop",
    soundVolume: 0.55,
  });
});

test("normalizeNotificationSoundSettings preserves explicit disabled state and clamps volume", () => {
  assert.deepEqual(normalizeNotificationSoundSettings({ soundEnabled: false, soundId: "deep-bell", soundVolume: 1.6 }), {
    soundEnabled: false,
    soundId: "deep-bell",
    soundVolume: 1,
  });
  assert.deepEqual(normalizeNotificationSoundSettings({ soundEnabled: true, soundId: "soft-chime", soundVolume: -0.2 }), {
    soundEnabled: true,
    soundId: "soft-chime",
    soundVolume: 0,
  });
});
test("normalizeUserToastSettings restores malformed browser toast settings safely", () => {
  assert.deepEqual(normalizeUserToastSettings({
    marketListings: false,
    marketSales: "yes",
    production: null,
    soundEnabled: false,
    soundId: "unknown-tone",
    soundVolume: 5,
  }), {
    marketListings: false,
    marketSales: true,
    production: true,
    soundEnabled: false,
    soundId: "alert-pop",
    soundVolume: 1,
  });
  assert.deepEqual(normalizeUserToastSettings("bad saved value"), {
    marketListings: true,
    marketSales: true,
    production: true,
    soundEnabled: true,
    soundId: "alert-pop",
    soundVolume: 0.55,
  });
});