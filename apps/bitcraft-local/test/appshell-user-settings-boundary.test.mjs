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
