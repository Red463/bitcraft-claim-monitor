import assert from "node:assert/strict";
import test from "node:test";

import { NAV } from "../src/navigation.ts";
import { appendNotificationLog, appendToastStack, createToastNotice } from "../src/notifications/toastNotices.ts";
import {
  BOT_NOTIFICATION_EXCEPTION,
  NOTIFICATION_MATRIX_PAGES,
  SUPPORTED_BROWSER_NOTIFICATION_TYPES,
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
