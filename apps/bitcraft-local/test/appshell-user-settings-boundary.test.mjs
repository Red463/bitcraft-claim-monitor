import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("AppShell delegates browser-local user settings to a focused dialog component", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const dialogUrl = new URL("../src/components/main/UserSettingsDialog.tsx", import.meta.url);

  assert.equal(existsSync(dialogUrl), true, "UserSettingsDialog component should exist");
  const dialog = readFileSync(dialogUrl, "utf8");

  assert.match(appShell, /import \{ UserSettingsDialog \} from "\.\/components\/main\/UserSettingsDialog";/);
  assert.doesNotMatch(appShell, /function UserSettingsDialog\b/);
  assert.match(dialog, /export function UserSettingsDialog\b/);
  assert.match(dialog, /type UserSettingsDialogProps = \{/);
});

test("User settings exposes Discord market sale DM opt-out controls", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../src/components/main/UserSettingsDialog.tsx", import.meta.url), "utf8");

  assert.match(appShell, /discordMarketSaleDm/);
  assert.match(dialog, /onDiscordMarketSaleDmChange/);
  assert.match(dialog, /Send me Discord DMs for my confirmed market sales/);
});

test("signed-in Discord settings autosync without manual save and load buttons", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../src/components/main/UserSettingsDialog.tsx", import.meta.url), "utf8");

  assert.match(appShell, /syncAccountSettings/);
  assert.match(appShell, /applyAccountSettings/);
  assert.match(appShell, /userAuth\.user\?\.discordId/);
  assert.doesNotMatch(dialog, /onSaveAccountSettings/);
  assert.doesNotMatch(dialog, /onLoadAccountSettings/);
  assert.doesNotMatch(dialog, /Save settings to account/);
  assert.doesNotMatch(dialog, /Load saved settings/);
  assert.match(dialog, /Settings sync automatically while you are signed in with Discord/);
  assert.match(dialog, /Density, toast preferences, theme, sidebar state and groups, and your selected production member sync automatically/);
  assert.doesNotMatch(dialog, /your page, filters/);
  assert.match(dialog, /Page and filter choices stay in this browser\./);
});

test("approved Discord character links require unlink before relink", () => {
  const dialog = readFileSync(new URL("../src/components/main/UserSettingsDialog.tsx", import.meta.url), "utf8");

  assert.match(dialog, /characterLinkApproved/);
  assert.match(dialog, /disabled=\{characterLinkApproved\}/);
  assert.match(dialog, /Unlink character/);
  assert.match(dialog, /onLinkCharacter\(null\)/);
});
test("User settings show notification types disabled by admin without overwriting user preference", () => {
  const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../src/components/main/UserSettingsDialog.tsx", import.meta.url), "utf8");

  assert.match(appShell, /appToastSettings=\{appSettings\.toastSettings\}/);
  assert.match(dialog, /appToastSettings/);
  assert.match(dialog, /Disabled by admin/);
  assert.match(dialog, /disabled=\{!appToastSettings\[key\]\}/);
  assert.match(dialog, /checked=\{toastSettings\[key\]\}/);
});

test("User settings exposes per-notification sound selectors", () => {
  const dialog = readFileSync(new URL("../src/components/main/UserSettingsDialog.tsx", import.meta.url), "utf8");

  assert.match(dialog, /SOUND_TYPE_OPTIONS/);
  assert.match(dialog, /productionStarted/);
  assert.match(dialog, /productionCompleted/);
  assert.match(dialog, /dealAlerts/);
  assert.match(dialog, /soundByType/);
  assert.match(dialog, /previewNotificationSound\(\{ soundId: soundId, soundVolume: toastSettings\.soundVolume \}\)/);
});

test("User settings keeps tabs fixed and gives content the bounded scroll region", () => {
  const css = readFileSync(new URL("../src/styles/user-settings.css", import.meta.url), "utf8");

  assert.match(css, /\.settings-shell\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\);[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.settings-grid\s*\{[^}]*min-height:\s*0;[^}]*max-height:\s*none;[^}]*overflow:\s*auto;/s);
  assert.doesNotMatch(css, /\.settings-grid\s*\{[^}]*max-height:\s*calc\(100vh - 170px\)/s);
});
