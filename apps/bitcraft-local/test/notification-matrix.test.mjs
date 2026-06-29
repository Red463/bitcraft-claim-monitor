import assert from "node:assert/strict";
import test from "node:test";

import { NAV } from "../src/navigation.ts";
import { installBrowserNotificationSmokeBridge, smokeBrowserNotificationDraft, isLocalNotificationSmokeHost, smokeNotificationTypeFromSearch } from "../src/notifications/browserSmoke.ts";
import { appendNotificationLog, appendToastStack, createToastNotice } from "../src/notifications/toastNotices.ts";
import {
  BOT_NOTIFICATION_EXCEPTION,
  NOTIFICATION_MATRIX_PAGES,
  SUPPORTED_BROWSER_NOTIFICATION_TYPES,
  pageScopedBrowserNotificationDraft,
  sampleBrowserNotificationDraft,
  verificationRowsForStatus,
} from "../src/notifications/verificationMatrix.ts";

test("notification verification matrix covers every routed main app panel", () => {
  const navPanels = NAV.map(([id]) => id).sort();
  const matrixPanels = NOTIFICATION_MATRIX_PAGES.map((page) => page.panel).sort();

  assert.deepEqual(matrixPanels, navPanels);
});

test("notification verification matrix names every supported browser notification type", () => {
  assert.deepEqual(SUPPORTED_BROWSER_NOTIFICATION_TYPES.map((type) => type.id), [
    "market-listing",
    "market-sale",
    "market-deal-alert",
    "production-started",
    "production-completed",
  ]);
  assert.equal(SUPPORTED_BROWSER_NOTIFICATION_TYPES.every((type) => type.source && type.expectedDestination), true);
});

test("notification verification matrix keeps the dedicated bot route as an explicit exception", () => {
  assert.deepEqual(BOT_NOTIFICATION_EXCEPTION, {
    route: "/bot",
    supported: false,
    reason: "Dedicated bot dashboard mounts BotControlApp without DashboardApp notification chrome.",
  });
});

test("verificationRowsForStatus produces one row for every page and type combination", () => {
  const rows = verificationRowsForStatus("manual-required");

  assert.equal(rows.length, NOTIFICATION_MATRIX_PAGES.length * SUPPORTED_BROWSER_NOTIFICATION_TYPES.length);
  assert.deepEqual(rows[0], {
    page: NOTIFICATION_MATRIX_PAGES[0],
    type: SUPPORTED_BROWSER_NOTIFICATION_TYPES[0],
    status: "manual-required",
  });
});

test("every supported notification type can produce a page-independent toast notice", () => {
  for (const type of SUPPORTED_BROWSER_NOTIFICATION_TYPES) {
    const draft = sampleBrowserNotificationDraft(type.id);
    const notice = createToastNotice({ id: `matrix-${type.id}`, ...draft });
    const stack = appendToastStack([], notice);
    const log = appendNotificationLog([], notice);

    assert.equal(notice.destination, type.expectedDestination);
    assert.equal(notice.sourceKey.length > 0, true);
    assert.deepEqual(stack, [notice]);
    assert.deepEqual(log, [notice]);
  }
});
test("every routed page and notification type has a unique page-scoped sample draft", () => {
  const sourceKeys = new Set();

  for (const page of NOTIFICATION_MATRIX_PAGES) {
    for (const type of SUPPORTED_BROWSER_NOTIFICATION_TYPES) {
      const draft = pageScopedBrowserNotificationDraft(page.panel, type.id);
      const notice = createToastNotice({ id: `matrix-${page.panel}-${type.id}`, ...draft });

      assert.equal(notice.destination, type.expectedDestination);
      assert.equal(notice.sourceKey.includes(`matrix:${page.panel}:${type.id}:`), true);
      assert.equal(sourceKeys.has(notice.sourceKey), false, `duplicate source key for ${page.panel} / ${type.id}`);
      sourceKeys.add(notice.sourceKey);
    }
  }

  assert.equal(sourceKeys.size, NOTIFICATION_MATRIX_PAGES.length * SUPPORTED_BROWSER_NOTIFICATION_TYPES.length);
});
test("notification smoke helper creates unique loopback-only browser-verification drafts", () => {
  assert.equal(isLocalNotificationSmokeHost("127.0.0.1"), true);
  assert.equal(isLocalNotificationSmokeHost("localhost"), true);
  assert.equal(isLocalNotificationSmokeHost("bitcraft.example.com"), false);

  for (const type of SUPPORTED_BROWSER_NOTIFICATION_TYPES) {
    const first = smokeBrowserNotificationDraft(type.id, "dashboard");
    const second = smokeBrowserNotificationDraft(type.id, "market");

    assert.equal(first.destination, type.expectedDestination);
    assert.equal(second.destination, type.expectedDestination);
    assert.equal(first.sourceKey.includes(`smoke:${type.id}:dashboard`), true);
    assert.equal(second.sourceKey.includes(`smoke:${type.id}:market`), true);
    assert.notEqual(first.sourceKey, second.sourceKey);
  }
});
test("notification smoke bridge installs only on loopback and pushes valid sample notices", () => {
  const listeners = new Map();
  const pushed = [];
  const target = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };

  const skippedCleanup = installBrowserNotificationSmokeBridge({
    hostname: "bitcraft.example.com",
    target,
    pushNotice: (notice) => pushed.push(notice),
    nextRunId: () => "skip",
  });
  assert.equal(listeners.size, 0);
  skippedCleanup();

  const cleanup = installBrowserNotificationSmokeBridge({
    hostname: "127.0.0.1",
    target,
    pushNotice: (notice) => pushed.push(notice),
    nextRunId: () => "production-page",
  });
  const listener = listeners.get("bitcraft:notification-smoke");
  assert.equal(typeof listener, "function");

  listener({ detail: { typeId: "production-completed" } });
  listener({ detail: { typeId: "not-supported" } });

  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].title, "Craft completed");
  assert.equal(pushed[0].destination, "production");
  assert.equal(pushed[0].sourceKey.includes("smoke:production-completed:production-page"), true);

  cleanup();
  assert.equal(listeners.size, 0);
});
test("notification smoke query parser accepts only supported smoke notification types", () => {
  assert.equal(smokeNotificationTypeFromSearch("?page=dashboard&smokeNotification=market-deal-alert"), "market-deal-alert");
  assert.equal(smokeNotificationTypeFromSearch("?smokeNotification=production-started"), "production-started");
  assert.equal(smokeNotificationTypeFromSearch("?smokeNotification=storage"), null);
  assert.equal(smokeNotificationTypeFromSearch("?page=dashboard"), null);
});
