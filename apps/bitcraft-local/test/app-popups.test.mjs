import assert from "node:assert/strict";
import test from "node:test";

import {
  dismissalStateAfterAction,
  normalizePopupConfig,
  popupDismissalKey,
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
      enabled: true,
      updatedAt: "2026-07-01T12:00:00.000Z",
    },
    {
      id: "bad-values",
      title: "Bad values",
      message: "Uses defaults",
      type: "info",
      mode: "oneTime",
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