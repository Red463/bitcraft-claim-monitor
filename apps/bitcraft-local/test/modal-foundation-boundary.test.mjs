import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const dialogUrl = new URL("../src/components/main/Dialog.tsx", import.meta.url);

test("shared Dialog owns the accessible modal interaction contract", () => {
  assert.equal(existsSync(dialogUrl), true, "Dialog primitive should exist");
  const dialog = readFileSync(dialogUrl, "utf8");

  assert.match(dialog, /createPortal\(/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal=\{modal \? "true" : undefined\}/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /aria-describedby=\{description \? descriptionId : undefined\}/);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /initialFocusRef\?\.current/);
  assert.match(dialog, /document\.addEventListener\("focusin"/);
  assert.match(dialog, /triggerRef\.current\?\.focus\(\)/);
  assert.match(dialog, /document\.body\.style\.overflow = "hidden"/);
  assert.match(dialog, /modalLockCount/);
});

test("shared Dialog owns viewport bounds, internal scrolling, and reduced motion", () => {
  const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

  assert.match(css, /:where\(\.dialog-backdrop\)\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  assert.match(css, /:where\(\.dialog-backdrop\)\s*\{[^}]*overflow:\s*auto;/s);
  assert.match(css, /:where\(\.dialog-surface\)\s*\{[^}]*max-height:\s*calc\(100dvh - 40px\);/s);
  assert.match(css, /:where\(\.dialog-surface\)\s*\{[^}]*overflow:\s*auto;/s);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*:where\(\.dialog-backdrop\)[\s\S]*animation:\s*none/);
});

test("global and feature overlays delegate dialog semantics to the primitive", () => {
  const files = [
    "../src/components/main/LegalDialogs.tsx",
    "../src/components/main/UserSettingsDialog.tsx",
    "../src/components/main/CommandPalette.tsx",
    "../src/components/main/Notifications.tsx",
    "../src/components/main/FirstRunTourManager.tsx",
    "../src/pages/CraftPlanManagerDialog.tsx",
    "../src/pages/MembersPage.tsx",
    "../src/pages/EmpiresPage.tsx",
    "../src/pages/MapPage.tsx",
    "../src/components/admin/AdminPopupsSection.tsx",
    "../src/pages/CraftPlanningPage.tsx",
  ];

  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.match(source, /import \{ Dialog \} from /, `${file} should import Dialog`);
    assert.match(source, /<Dialog\b/, `${file} should render Dialog`);
  }
});

test("the notification drawer remains non-modal while blocking dialogs opt into modal behavior", () => {
  const notifications = readFileSync(new URL("../src/components/main/Notifications.tsx", import.meta.url), "utf8");
  const legal = readFileSync(new URL("../src/components/main/LegalDialogs.tsx", import.meta.url), "utf8");
  const notificationCss = readFileSync(new URL("../src/styles/notifications.css", import.meta.url), "utf8");

  assert.match(notifications, /<Dialog[\s\S]*modal=\{false\}/);
  assert.match(legal, /<Dialog[\s\S]*title="Help improve Claim Monitor"/);
  assert.match(notificationCss, /\.drawer-overlay\s*\{[^}]*padding:\s*0;/s);
  assert.match(notificationCss, /\.drawer-overlay\s*\{[^}]*align-items:\s*stretch;/s);
  assert.match(notificationCss, /\.drawer-overlay\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(notificationCss, /\.notice-drawer\s*\{[^}]*height:\s*100dvh;[^}]*max-height:\s*100dvh;[^}]*overflow:\s*auto;/s);
});

test("AppShell resolves consent before mounting optional Discord identity", () => {
  const shell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");

  assert.match(shell, /consent != null && !discordPromptDismissed && userAuth\.discordLoginEnabled && !userAuth\.user/);
});

test("settings becomes non-modal while the guided tour owns the active decision", () => {
  const shell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  assert.match(shell, /<UserSettingsDialog[\s\S]*modal=\{!tourVisible\}/);
});
