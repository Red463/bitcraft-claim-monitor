import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const appShell = readFileSync(new URL("../src/AppShell.tsx", import.meta.url), "utf8");
const legalDialogs = readFileSync(new URL("../src/components/main/LegalDialogs.tsx", import.meta.url), "utf8");
const acceptanceUrl = new URL("../src/components/main/LegalAcceptanceDialog.tsx", import.meta.url);
const css = readFileSync(new URL("../src/styles/app-chrome.css", import.meta.url), "utf8");

test("Discord login requires explicit age and legal confirmations before OAuth starts", () => {
  assert.equal(existsSync(acceptanceUrl), true);
  const dialog = readFileSync(acceptanceUrl, "utf8");

  assert.match(dialog, /I confirm I am at least 18/);
  assert.match(dialog, /I agree to the Terms of Service/);
  assert.match(dialog, /Privacy Policy/);
  assert.match(dialog, /acceptedTerms && ageConfirmed/);
  assert.match(appShell, /fetch\(`\$\{LOCAL_API\}\/auth\/discord\/start`[\s\S]{0,180}method:\s*"POST"/);
  assert.match(appShell, /acceptedTerms[\s\S]*ageConfirmed/);
});

test("current-policy acceptance is mandatory for stale signed-in sessions", () => {
  const dialog = readFileSync(acceptanceUrl, "utf8");

  assert.match(appShell, /userAuth\.legal\.requiresAcceptance/);
  assert.match(appShell, /\/auth\/legal\/accept/);
  assert.match(appShell, /x-csrf-token/);
  assert.match(dialog, /Accept and continue/);
  assert.match(dialog, /closeOnBackdrop=\{false\}/);
  assert.match(dialog, /\/terms/);
  assert.match(dialog, /\/privacy/);
});

test("all app sign-in surfaces use the gated action instead of raw OAuth links", () => {
  const priceFinder = readFileSync(new URL("../src/pages/market/PriceFinder.tsx", import.meta.url), "utf8");
  const dealWatchlist = readFileSync(new URL("../src/pages/market/DealWatchlist.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(legalDialogs, /<a[^>]+href=\{authHref\}/);
  assert.doesNotMatch(appShell, /href=\{discordAuthHref\}/);
  assert.doesNotMatch(priceFinder, /window\.location\.href\s*=\s*`\$\{LOCAL_API\}\/auth\/discord\/start/);
  assert.doesNotMatch(dealWatchlist, /window\.location\.href\s*=\s*`\$\{LOCAL_API\}\/auth\/discord\/start/);
});

test("acceptance is a fixed viewport dialog with bounded internal scrolling", () => {
  assert.match(css, /\.legal-acceptance-overlay\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;/s);
  assert.match(css, /\.legal-acceptance-dialog\s*\{[^}]*max-height:\s*calc\(100vh/s);
  assert.match(css, /\.legal-acceptance-body\s*\{[^}]*overflow-y:\s*auto;/s);
});
