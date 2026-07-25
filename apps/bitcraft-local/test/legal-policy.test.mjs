import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  legalPolicyForEnvironment,
} from "../src/legal/legalPolicy.mjs";
import { legalPolicyDigests } from "../src/server/legalPolicyDigest.mjs";

test("default policy identifies the individual operator without inventing a company", () => {
  const policy = legalPolicyForEnvironment({});

  assert.equal(policy.version, LEGAL_VERSION);
  assert.equal(policy.effectiveDate, LEGAL_EFFECTIVE_DATE);
  assert.equal(policy.operator.controllerName, "Thomas Bush");
  assert.equal(policy.operator.projectName, "Timbersteel Claim Monitor");
  assert.equal(policy.operator.privacyEmail, "privacy@timbersteeltrade.com");
  assert.equal(policy.operator.minimumAge, 18);
  assert.match(policy.operator.status, /individual developer and operator/i);
  assert.match(policy.operator.status, /not a company or separate legal entity/i);
  assert.equal("postalAddress" in policy.operator, false);
});

test("policy contains the approved legal subjects, providers, and retention rules", () => {
  const policy = legalPolicyForEnvironment({});
  for (const sectionId of [
    "operator",
    "eligibility",
    "accounts-and-sessions",
    "character-linking",
    "discord-and-app-features",
    "acceptable-use",
    "suspension-and-termination",
    "intellectual-property",
    "third-party-services",
    "donations",
    "availability",
    "liability",
    "complaints",
    "changes",
    "general-terms",
    "governing-law",
  ]) {
    assert.ok(policy.terms.sections.some(({ id }) => id === sectionId), `missing Terms section ${sectionId}`);
  }
  for (const sectionId of [
    "controller",
    "data-we-process",
    "lawful-bases",
    "character-linking",
    "discord-administration",
    "analytics",
    "sharing",
    "international-transfers",
    "retention",
    "rights",
    "deletion-and-backups",
    "security",
    "complaints",
    "contact",
  ]) {
    assert.ok(policy.privacy.sections.some(({ id }) => id === sectionId), `missing Privacy section ${sectionId}`);
  }
  assert.deepEqual(
    policy.providers.map(({ key }) => key),
    ["hostworld", "namecheap", "discord", "bitjita", "proton", "buy-me-a-coffee", "github"],
  );
  assert.ok(policy.retention.some(({ key, days }) => key === "full-ip" && days === 7));
  assert.ok(policy.retention.some(({ key, days }) => key === "analytics-events" && days === 90));
  assert.ok(policy.retention.some(({ key, days }) => key === "deletion-ledger" && days === 90));
  assert.ok(policy.retention.some(({ key, months }) => key === "inactive-accounts" && months === 24));
});

test("deployment overrides affect the published policy and stable digests", () => {
  const overrides = {
    LEGAL_CONTROLLER_NAME: "Example Operator",
    LEGAL_PROJECT_NAME: "Example Monitor",
    LEGAL_PRIVACY_EMAIL: "privacy@example.test",
    LEGAL_CONTROLLER_COUNTRY: "France",
    LEGAL_GOVERNING_LAW: "France",
    LEGAL_MINIMUM_AGE: "19",
  };
  const first = legalPolicyForEnvironment(overrides);
  const second = legalPolicyForEnvironment(overrides);

  assert.equal(first.operator.controllerName, "Example Operator");
  assert.equal(first.operator.minimumAge, 19);
  assert.deepEqual(legalPolicyDigests(first), legalPolicyDigests(second));
  assert.notDeepEqual(legalPolicyDigests(first), legalPolicyDigests(legalPolicyForEnvironment({})));
});

test("production refuses an unconfirmed legal identity", () => {
  assert.throws(
    () => legalPolicyForEnvironment({ NODE_ENV: "production" }),
    /LEGAL_CONFIGURATION_CONFIRMED/,
  );
  assert.doesNotThrow(() => legalPolicyForEnvironment({
    NODE_ENV: "production",
    LEGAL_CONFIGURATION_CONFIRMED: "true",
  }));
});

test("invalid legal configuration fails closed", () => {
  assert.throws(() => legalPolicyForEnvironment({ LEGAL_MINIMUM_AGE: "17" }), /minimum age/i);
  assert.throws(() => legalPolicyForEnvironment({ LEGAL_PRIVACY_EMAIL: "invalid" }), /privacy email/i);
  assert.throws(() => legalPolicyForEnvironment({ LEGAL_CONTROLLER_NAME: " " }), /controller name/i);
});
