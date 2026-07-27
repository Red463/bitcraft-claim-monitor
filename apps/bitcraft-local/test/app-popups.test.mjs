import assert from "node:assert/strict";
import test from "node:test";

import {
  dismissalStateAfterAction,
  normalizePopupConfig,
  popupDismissalKey,
  popupPageLabel,
  selectNextPopup,
} from "../src/popups/appPopups.ts";

test("normalizePopupConfig trims, clamps, and keeps valid popup definitions", () => {
  const config = normalizePopupConfig({
    popups: [
      {
        id: " release-warning ",
        title: "  Market downtime ",
        message: "  Trading tools are being updated. ",
        type: "warning",
        mode: "repeatUntilDismissed",
        enabled: true,
        updatedAt: "2026-07-01T12:00:00.000Z",
      },
      {
        id: "",
        title: "Missing id",
        message: "Ignored",
      },
      {
        id: "bad-values",
        title: "Bad values",
        message: "Uses defaults",
        type: "loud",
        mode: "forever",
        enabled: "yes",
      },
    ],
  });

  assert.deepEqual(config.popups, [
    {
      id: "release-warning",
      title: "Market downtime",
      message: "Trading tools are being updated.",
      type: "warning",
      mode: "repeatUntilDismissed",
      page: "any",
      expiresAt: "",
      enabled: true,
      updatedAt: "2026-07-01T12:00:00.000Z",
    },
    {
      id: "bad-values",
      title: "Bad values",
      message: "Uses defaults",
      type: "info",
      mode: "oneTime",
      page: "any",
      expiresAt: "",
      enabled: false,
      updatedAt: "",
    },
  ]);
});

test("selectNextPopup skips disabled, persistently dismissed, and session-suppressed popups", () => {
  const config = normalizePopupConfig({
    popups: [
      { id: "disabled", title: "Disabled", message: "Hidden", enabled: false },
      { id: "one-time", title: "One time", message: "Already accepted", enabled: true, updatedAt: "v1" },
      { id: "tip", title: "Tip", message: "Already seen this session", enabled: true, mode: "repeatUntilDismissed", updatedAt: "v1" },
      { id: "next", title: "Next", message: "Visible", enabled: true, type: "success", updatedAt: "v2" },
    ],
  });

  const selected = selectNextPopup(config.popups, {
    persistentDismissals: [popupDismissalKey(config.popups[1])],
    sessionDismissals: [popupDismissalKey(config.popups[2])],
  });

  assert.equal(selected?.id, "next");
});

test("popupDismissalKey changes when an admin edits a popup", () => {
  const original = normalizePopupConfig({ popups: [{ id: "tip", title: "Tip", message: "Old", updatedAt: "2026-07-01T12:00:00.000Z" }] }).popups[0];
  const edited = normalizePopupConfig({ popups: [{ id: "tip", title: "Tip", message: "New", updatedAt: "2026-07-01T13:00:00.000Z" }] }).popups[0];

  assert.notEqual(popupDismissalKey(original), popupDismissalKey(edited));
});

test("dismissalStateAfterAction makes repeatable OK session-only and never persistent", () => {
  const repeatable = normalizePopupConfig({ popups: [{ id: "tip", title: "Tip", message: "Helpful", mode: "repeatUntilDismissed", enabled: true, updatedAt: "v1" }] }).popups[0];
  const oneTime = normalizePopupConfig({ popups: [{ id: "release", title: "Release", message: "Read once", mode: "oneTime", enabled: true, updatedAt: "v1" }] }).popups[0];

  const repeatableOk = dismissalStateAfterAction(repeatable, "ok", {});
  assert.deepEqual(repeatableOk.persistentDismissals, []);
  assert.deepEqual(repeatableOk.sessionDismissals, [popupDismissalKey(repeatable)]);

  const repeatableNever = dismissalStateAfterAction(repeatable, "never", repeatableOk);
  assert.deepEqual(repeatableNever.persistentDismissals, [popupDismissalKey(repeatable)]);
  assert.deepEqual(repeatableNever.sessionDismissals, [popupDismissalKey(repeatable)]);

  const oneTimeOk = dismissalStateAfterAction(oneTime, "ok", {});
  assert.deepEqual(oneTimeOk.persistentDismissals, [popupDismissalKey(oneTime)]);
  assert.deepEqual(oneTimeOk.sessionDismissals, []);
});
test("normalizePopupConfig defaults popup targeting and preserves valid expiry dates", () => {
  const config = normalizePopupConfig({
    popups: [
      { id: "old", title: "Old", message: "Any page", enabled: true, updatedAt: "v1" },
      { id: "prod", title: "Production", message: "Production only", enabled: true, page: "production", expiresAt: "2026-07-15", updatedAt: "v1" },
      { id: "regional", title: "Region", message: "Region only", enabled: true, page: "empire", expiresAt: "2026-07-15", updatedAt: "v1" },
      { id: "bad", title: "Bad page", message: "Defaults", enabled: true, page: "unknown", expiresAt: "15/07/2026", updatedAt: "v1" },
    ],
  }, { today: "2026-07-14" });

  assert.equal(config.popups[0].page, "any");
  assert.equal(config.popups[0].expiresAt, "");
  assert.equal(config.popups[1].page, "craft-monitor");
  assert.equal(config.popups[1].expiresAt, "2026-07-15");
  assert.equal(config.popups[1].enabled, true);
  assert.equal(config.popups[2].page, "region");
  assert.equal(config.popups[3].page, "any");
  assert.equal(config.popups[3].expiresAt, "");
  assert.equal(popupPageLabel("craft-monitor"), "Craft Monitor");
  assert.equal(popupPageLabel("region"), "Region");
});

test("normalizePopupConfig disables expired popups without deleting them", () => {
  const config = normalizePopupConfig({
    popups: [
      { id: "expired", title: "Expired", message: "Past", enabled: true, expiresAt: "2026-07-15", updatedAt: "v1" },
      { id: "future", title: "Future", message: "Visible", enabled: true, expiresAt: "2026-07-16", updatedAt: "v1" },
    ],
  }, { today: "2026-07-15" });

  assert.deepEqual(config.popups.map((popup) => [popup.id, popup.enabled]), [["expired", false], ["future", true]]);
  assert.equal(config.popups[0].expiresAt, "2026-07-15");
});

test("selectNextPopup filters popups by active page", () => {
  const config = normalizePopupConfig({
    popups: [
      { id: "market", title: "Market", message: "Market page", enabled: true, page: "market", updatedAt: "v1" },
      { id: "production", title: "Production", message: "Production page", enabled: true, page: "production", updatedAt: "v1" },
      { id: "any", title: "Any", message: "Any page", enabled: true, page: "any", updatedAt: "v1" },
    ],
  });

  assert.equal(selectNextPopup(config.popups, {}, { page: "craft-monitor" })?.id, "production");
  assert.equal(selectNextPopup(config.popups, {}, { page: "inventory" })?.id, "any");
});
