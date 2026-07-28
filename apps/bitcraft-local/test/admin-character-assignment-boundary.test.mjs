import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const access = readFileSync(new URL("../src/components/admin/AdminAccessSection.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../src/components/admin/AdminPanel.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles/admin.css", import.meta.url), "utf8");

test("Linked Accounts renders only the workflow relevant to each account state", () => {
  assert.match(access, /members:\s*AnyRecord\[\]/);
  assert.match(access, /onCharacterAssignment:\s*\(account:\s*AppUser,\s*member:\s*AnyRecord\s*\|\s*null\)\s*=>\s*void/);
  assert.match(access, /account\.characterStatus === "approved"[\s\S]*Unassign/);
  assert.match(access, /account\.characterStatus === "pending"[\s\S]*onAccountApproval\(account, "approved"\)[\s\S]*Approve request[\s\S]*onAccountApproval\(account, "rejected"\)[\s\S]*Reject/);
  assert.match(access, /account\.characterStatus === "rejected"[\s\S]*onAccountApproval\(account, "pending"\)[\s\S]*Review again/);
  assert.match(access, /Assign & approve/);
  assert.match(access, /Choose different character/);
  assert.doesNotMatch(access, /\(\["approved", "pending", "rejected"\] as const\)\.map/);
  assert.match(access, /memberTrackingId\(member\)/);
});

test("Linked Accounts keeps administrator assignment explicit, blank, and guarded", () => {
  assert.match(access, /characterAssignments\[account\.id\]\s*\?\?\s*""/);
  assert.match(access, /selectedCharacterMatchesRequest/);
  assert.match(access, /selectedCharacterUnavailable/);
  assert.match(access, /disabled=\{membersLoading \|\| !selectedMember \|\| selectedCharacterUnavailable \|\| selectedCharacterMatchesRequest \|\| accountActionPending\}/);
  assert.match(access, /accountActionPending = accountApprovalPending \|\| accountCharacterPending \|\| accountDeletionPending/);
  assert.match(access, /This character is already approved for another Discord account\./);
  assert.match(access, /pendingCharacterUnavailable[\s\S]*disabled=\{!account\.characterPlayerId \|\| pendingCharacterUnavailable \|\| accountActionPending\}/);
});

test("Linked Accounts sorts pending requests first without disturbing either group", () => {
  assert.match(access, /const orderedLinkedAccounts = \[\.\.\.data\.linkedAccounts\]\.sort/);
  assert.match(access, /Number\(right\.characterStatus === "pending"\) - Number\(left\.characterStatus === "pending"\)/);
  assert.match(access, /orderedLinkedAccounts\.map\(\(account\) =>/);
});

test("Linked Accounts keeps destructive deletion under an accessible overflow menu", () => {
  assert.match(access, /<details className="linked-account-more-actions">/);
  assert.match(access, /aria-label=\{`More actions for \$\{accountDisplayName\}`\}/);
  assert.match(access, /More actions/);
  assert.match(access, /linked-account-more-menu[\s\S]*Delete account data/);
  assert.match(access, /setPrivacyDeletionTarget\(account\)/);
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
  assert.match(access, /disabled=\{membersLoading \|\| !data\.members\.length \|\| accountActionPending\}/);
});

test("Linked Accounts displays the loader failure message without a duplicated prefix", () => {
  assert.match(panel, /setMembersError\(detail\)/);
  assert.doesNotMatch(panel, /setMembersError\(`Unable to load settlement characters\. \$\{detail\}`\)/);
  assert.match(access, /\{membersError\} Refresh and retry\./);
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

test("Linked account assignment remains dense, layered, and touch-friendly on narrow screens", () => {
  assert.match(css, /\.linked-account-row\s*\{[^}]*grid-template-columns:\s*minmax/);
  assert.match(css, /\.linked-account-character-actions/);
  assert.match(css, /\.linked-account-more-menu\s*\{[^}]*z-index:\s*var\(--z-dropdown\)/);
  assert.match(css, /\.linked-account-more-actions\s*>\s*summary:focus-visible/);
  assert.match(css, /@media \(max-width:\s*860px\)[\s\S]*\.linked-account-row\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width:\s*860px\)[\s\S]*\.linked-account-contextual-actions[\s\S]*min-height:\s*44px/);
});
