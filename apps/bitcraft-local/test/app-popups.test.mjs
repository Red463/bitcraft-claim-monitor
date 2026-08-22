import assert from "node:assert/strict";
import test from "node:test";

import {
  createPopupRefreshController,
  dismissalStateAfterAction,
  normalizePopupConfig,
  popupDismissalKey,
  popupPageLabel,
  selectNextPopup,
} from "../src/popups/appPopups.ts";

function deferred() {
  let resolve;
  const promise = new Promise((next) => { resolve = next; });
  return { promise, resolve };
}

function fakeVisibilityDocument(initialVisibility = "visible") {
  const listeners = new Set();
  return {
    visibilityState: initialVisibility,
    addEventListener(type, listener) {
      if (type === "visibilitychange") listeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "visibilitychange") listeners.delete(listener);
    },
    setVisibility(next) {
      this.visibilityState = next;
      for (const listener of listeners) listener();
    },
    listenerCount() { return listeners.size; },
  };
}

function fakeIntervals() {
  const callbacks = new Map();
  let nextId = 1;
  return {
    setInterval(callback, intervalMs) {
      const id = nextId++;
      callbacks.set(id, { callback, intervalMs });
      return id;
    },
    clearInterval(id) { callbacks.delete(id); },
    tick() { for (const { callback } of callbacks.values()) callback(); },
    intervals() { return [...callbacks.values()].map(({ intervalMs }) => intervalMs); },
    size() { return callbacks.size; },
  };
}

test("popup refresh loads on mount and when the page becomes visible, but stays idle while hidden", async () => {
  const documentTarget = fakeVisibilityDocument("visible");
  const timers = fakeIntervals();
  let loads = 0;
  const controller = createPopupRefreshController({
    documentTarget,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    load: async () => { loads += 1; },
  });

  await controller.start();
  assert.equal(loads, 1);
  assert.deepEqual(timers.intervals(), [300_000]);

  documentTarget.setVisibility("hidden");
  timers.tick();
  await Promise.resolve();
  assert.equal(loads, 1, "the fallback interval must not fetch in a hidden tab");

  documentTarget.setVisibility("visible");
  await Promise.resolve();
  assert.equal(loads, 2, "returning to the app should refresh operational popups");

  controller.stop();
  assert.equal(documentTarget.listenerCount(), 0);
  assert.equal(timers.size(), 0);
});

test("popup refresh coalesces overlapping triggers and cleanup prevents later loads", async () => {
  const documentTarget = fakeVisibilityDocument("visible");
  const timers = fakeIntervals();
  const firstLoad = deferred();
  let loads = 0;
  const controller = createPopupRefreshController({
    documentTarget,
    setInterval: timers.setInterval,
    clearInterval: timers.clearInterval,
    load: async () => {
      loads += 1;
      if (loads === 1) await firstLoad.promise;
    },
  });

  const started = controller.start();
  timers.tick();
  documentTarget.setVisibility("visible");
  assert.equal(loads, 1, "concurrent visibility and timer triggers must share the in-flight load");
  firstLoad.resolve();
  await started;

  controller.stop();
  timers.tick();
  documentTarget.setVisibility("visible");
  await Promise.resolve();
  assert.equal(loads, 1);
});

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
