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
  assert.match(access, /disabled=\{membersLoading \|\| !selectedMember \|\| selectedCharacterUnavailable \|\| pending/);
});

test("AdminPanel sends the selected member to the secured character route", () => {
  assert.match(panel, /members:\s*adminMemberRows/);
  assert.match(panel, /onCharacterAssignment=/);
  assert.match(panel, /\/admin\/user-accounts\/character/);
  assert.match(panel, /memberTrackingId\(member\)/);
  assert.match(panel, /memberDisplayName\(member\)/);
});

test("Linked Accounts loads a panel-owned roster only when no members were supplied", () => {
  assert.match(panel, /import\s*\{\s*loadAdminSettlementMembers\s*\}\s*from\s*["']\.\/adminSettlementMembers["']/);
  assert.match(panel, /const\s*\[fallbackMembers,\s*setFallbackMembers\]\s*=\s*React\.useState<AnyRecord\[\]>/);
  assert.match(panel, /if\s*\(members\.length\)\s*\{/);
  assert.match(panel, /loadAdminSettlementMembers\(settings\.claimId\)/);
  assert.match(panel, /const\s+effectiveMembers\s*=\s*members\.length\s*\?\s*members\s*:\s*fallbackMembers/);
  assert.match(panel, /<AdminAccessSection[\s\S]*membersLoading=\{membersLoading\}/);
  assert.match(panel, /<AdminAccessSection[\s\S]*membersError=\{membersError\}/);
});

test("Linked Accounts makes roster loading, empty, and failure states actionable", () => {
  assert.match(access, /membersLoading:\s*boolean/);
  assert.match(access, /membersError\?:\s*string\s*\|\s*null/);
  assert.match(access, /Loading settlement characters\.\.\./);
  assert.match(access, /No settlement characters available/);
  assert.match(access, /membersError[^]*role="alert"/);
  assert.match(access, /Refresh and retry\./);
  assert.match(access, /disabled=\{membersLoading \|\| !data\.members\.length \|\| pending\(`account-character:\$\{account\.id\}`\)\}/);
});

test("Linked Accounts ignores stale fallback roster responses", () => {
  assert.match(panel, /const\s+fallbackMembersRequest\s*=\s*React\.useRef\(0\)/);
  assert.match(panel, /const\s+requestGeneration\s*=\s*\+\+fallbackMembersRequest\.current/);
  assert.match(panel, /if\s*\(requestGeneration\s*!==\s*fallbackMembersRequest\.current\)\s*return/);
});

test("Linked Accounts tab loading owns the current roster source", () => {
  assert.match(panel, /tab-load:\$\{tab\}:\$\{botSection\}:\$\{analyticsDays\}:\$\{securityEventSearch\}:\$\{securityEventPage\}:\$\{securityEventPageSize\}:\$\{settings\.claimId\}:\$\{members\.length\}/);
});

test("Linked Accounts keeps roster failures local without hiding later admin request errors", () => {
  assert.match(panel, /class\s+FallbackMemberLoadError\s+extends\s+Error/);
  assert.match(panel, /if\s*\(error\s+instanceof\s+FallbackMemberLoadError\)\s*return/);
  assert.match(panel, /Promise\.allSettled\(\[refreshLinkedAccounts\(\), refreshFallbackMembers\(\)\]\)/);
  assert.match(panel, /error=\{messageKind === "error" \? message : null\}/);
});

test("Linked account assignment remains dense and becomes single-column on narrow screens", () => {
  assert.match(css, /\.linked-account-character-actions/);
  assert.match(css, /@media \(max-width:\s*860px\)[\s\S]*\.linked-account-row\s*\{[^}]*grid-template-columns:\s*1fr/);
});
