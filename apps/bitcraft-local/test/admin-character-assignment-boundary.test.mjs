import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const access = readFileSync(new URL("../src/components/admin/AdminAccessSection.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/admin.css", import.meta.url), "utf8");

test("Linked Accounts exposes direct assignment and explicit unassignment", () => {
  assert.match(access, /members:\s*AnyRecord\[\]/);
  assert.match(access, /onCharacterAssignment:\s*\(account:\s*AppUser,\s*member:\s*AnyRecord\s*\|\s*null\)\s*=>\s*void/);
  assert.match(access, /Assign & approve/);
  assert.match(access, /Unassign character/);
  assert.match(access, /memberTrackingId\(member\)/);
  assert.match(access, /account\.characterStatus === "approved"/);
  assert.match(access, /disabled=\{!selectedMember \|\| selectedCharacterUnavailable \|\| pending/);
});

test("AdminPanel sends the selected member to the secured character route", () => {
  assert.match(panel, /members:\s*adminMemberRows/);
  assert.match(panel, /onCharacterAssignment=/);
  assert.match(panel, /\/admin\/user-accounts\/character/);
  assert.match(panel, /memberTrackingId\(member\)/);
  assert.match(panel, /memberDisplayName\(member\)/);
});

test("Linked account assignment remains dense and becomes single-column on narrow screens", () => {
  assert.match(css, /\.linked-account-character-actions/);
  assert.match(css, /@media \(max-width:\s*860px\)[\s\S]*\.linked-account-row\s*\{[^}]*grid-template-columns:\s*1fr/);
});
