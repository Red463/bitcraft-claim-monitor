import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

test("AppShell delegates notification smoke wiring to the notifications hook", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const hookUrl = new URL("../src/notifications/useBrowserNotificationSmoke.ts", import.meta.url);

  assert.equal(existsSync(hookUrl), true, "notification smoke hook should exist");
  assert.match(appShell, /import \{ useBrowserNotificationSmoke \} from "\.\/notifications\/useBrowserNotificationSmoke";/);
  assert.match(appShell, /useBrowserNotificationSmoke\(\{ active, pushToast \}\);/);
  assert.doesNotMatch(appShell, /installBrowserNotificationSmokeBridge|smokeNotificationTypeFromSearch|smokeBrowserNotificationDraft|isLocalNotificationSmokeHost/);
});
test("AppShell delegates live notification source effects to the notifications hook", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const hookUrl = new URL("../src/notifications/useBrowserNotificationSources.ts", import.meta.url);

  assert.equal(existsSync(hookUrl), true, "notification source hook should exist");
  assert.match(appShell, /import \{ useBrowserNotificationSources \} from "\.\/notifications\/useBrowserNotificationSources";/);
  assert.match(appShell, /useBrowserNotificationSources\(\{/);
  assert.doesNotMatch(appShell, /marketActivityQueueToastDrafts|dealAlertQueueToastDrafts|productionCraftQueueToastDrafts/);
  assert.doesNotMatch(appShell, /MarketActivityToastSnapshot|ProductionCraftQueueSnapshot|activityNoticeIdsRef|dealAlertIdsRef|craftQueueRef/);
});
test("AppShell delegates toast state, timers, and persisted log to the notifications hook", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const hookUrl = new URL("../src/notifications/useToastNotifications.ts", import.meta.url);

  assert.equal(existsSync(hookUrl), true, "toast notification hook should exist");
  assert.match(appShell, /import \{ useToastNotifications \} from "\.\/notifications\/useToastNotifications";/);
  assert.match(appShell, /useToastNotifications\(\{ soundSettings: normalizedUserToastSettings \}\)/);
  assert.doesNotMatch(appShell, /appendNotificationLog|appendToastStack|createToastNotice|markNotificationsRead|toastTimersRef|notificationSourceKeysRef/);
});
test("AppShell only marks production notifications ready when the payload includes crafts", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(appShell, /hasProductionData:\s*Boolean\(state\.data\)/);
  assert.match(appShell, /hasProductionData:\s*hasProductionPayload\(state\.data\)/);
});
test("notification drawer uses the shared toast meta formatter", () => {
  const notifications = readFileSync(new URL("../src/components/main/Notifications.tsx", import.meta.url), "utf8");

  assert.match(notifications, /formatToastMetaLine/);
  assert.match(notifications, /className="toast-event-time"/);
  assert.match(notifications, /timeAgo\(notice\.occurredAt\)/);
});

test("toast notifications sync log state and source keys across tabs", () => {
  const hook = readFileSync(new URL("../src/notifications/useToastNotifications.ts", import.meta.url), "utf8");

  assert.match(hook, /notificationLogStorageKey/);
  assert.match(hook, /addEventListener\("storage"/);
  assert.match(hook, /claimNotificationSourceKey/);
});

test("browser notification sources skip queue processing while the document is hidden", () => {
  const hook = readFileSync(new URL("../src/notifications/useBrowserNotificationSources.ts", import.meta.url), "utf8");

  assert.match(hook, /document\.visibilityState\s*===\s*"hidden"/);
});