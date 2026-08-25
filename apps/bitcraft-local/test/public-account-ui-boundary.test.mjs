import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const account = readFileSync(new URL("../src/public/PublicAccountSettings.tsx", import.meta.url), "utf8");
const legal = readFileSync(new URL("../src/public/PublicLegalPage.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../src/public/PublicAppShell.tsx", import.meta.url), "utf8");

test("public shell renders dedicated account/settings and legal/privacy pages", () => {
  assert.match(shell, /PublicAccountSettings/);
  assert.match(shell, /PublicLegalPage/);
  assert.match(shell, /route\.id === "account"/);
  assert.match(shell, /route\.id === "settings"/);
  assert.match(shell, /route\.id === "terms"/);
  assert.match(shell, /route\.id === "privacy"/);
});

test("public account settings exposes sign-in, legal acceptance, export, logout, reauth, and deletion preflight", () => {
  for (const label of [
    "Sign in with Discord",
    "Accept the current documents",
    "Download my data",
    "Sign out",
    "Reauthenticate with Discord",
    "Review account deletion",
  ]) assert.match(account, new RegExp(label));
  assert.match(account, /privacy@claim-monitor\.com/);
  assert.doesNotMatch(account, /api\/local|Featurebase|character link|admin/i);
});

test("public legal pages render the server-owned Claim Monitor policy and effective date", () => {
  assert.match(legal, /loadPublicLegal/);
  assert.match(legal, /effectiveDate/);
  assert.match(legal, /policy\.terms/);
  assert.match(legal, /policy\.privacy/);
  assert.match(legal, /providers/);
  assert.match(legal, /retention/);
});
