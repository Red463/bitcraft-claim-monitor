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
