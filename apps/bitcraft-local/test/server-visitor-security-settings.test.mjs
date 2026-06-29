import assert from "node:assert/strict";
import test from "node:test";

import { normalizeVisitorSecuritySettings } from "../src/server/visitorSecuritySettings.mjs";

test("visitor security settings normalize public defaults and clamp retention", () => {
  assert.deepEqual(normalizeVisitorSecuritySettings(null), {
    fullIpRetentionDays: 7,
    statsRetentionDays: 180,
    geoipProvider: "ipapi",
    geoipCacheDays: 30,
    geoipSourceUrl: "",
    geoipAccountId: "",
    geoipLicenseKeyConfigured: false,
  });

  assert.deepEqual(normalizeVisitorSecuritySettings({
    fullIpRetentionDays: "0",
    statsRetentionDays: "1",
    geoipProvider: "unknown",
    geoipCacheDays: "0",
    geoipSourceUrl: "  http://example.test/geo.zip  ",
  }), {
    fullIpRetentionDays: 7,
    statsRetentionDays: 30,
    geoipProvider: "ipapi",
    geoipCacheDays: 30,
    geoipSourceUrl: "http://example.test/geo.zip",
    geoipAccountId: "",
    geoipLicenseKeyConfigured: false,
  });

  assert.deepEqual(normalizeVisitorSecuritySettings({
    fullIpRetentionDays: "99",
    statsRetentionDays: "9999",
    geoipProvider: "local",
    geoipCacheDays: "500",
  }), {
    fullIpRetentionDays: 30,
    statsRetentionDays: 730,
    geoipProvider: "local",
    geoipCacheDays: 90,
    geoipSourceUrl: "",
    geoipAccountId: "",
    geoipLicenseKeyConfigured: false,
  });
});

test("visitor security settings include and preserve secrets only when requested", () => {
  const previous = { geoipLicenseKey: "existing-license" };

  assert.deepEqual(normalizeVisitorSecuritySettings({
    geoipProvider: "disabled",
    geoipAccountId: "  account-1  ",
    geoipLicenseKey: "  submitted-license  ",
  }, { includeSecrets: true, previous }), {
    fullIpRetentionDays: 7,
    statsRetentionDays: 180,
    geoipProvider: "disabled",
    geoipCacheDays: 30,
    geoipSourceUrl: "",
    geoipAccountId: "account-1",
    geoipLicenseKeyConfigured: true,
    geoipLicenseKey: "submitted-license",
  });

  assert.deepEqual(normalizeVisitorSecuritySettings({
    geoipAccountId: "account-1",
    geoipLicenseKey: "",
  }, { includeSecrets: true, previous }), {
    fullIpRetentionDays: 7,
    statsRetentionDays: 180,
    geoipProvider: "ipapi",
    geoipCacheDays: 30,
    geoipSourceUrl: "",
    geoipAccountId: "account-1",
    geoipLicenseKeyConfigured: true,
    geoipLicenseKey: "existing-license",
  });

  assert.equal(Object.hasOwn(normalizeVisitorSecuritySettings({ geoipLicenseKey: "secret" }), "geoipLicenseKey"), false);
  assert.equal(normalizeVisitorSecuritySettings({ geoipLicenseKey: "secret" }).geoipLicenseKeyConfigured, true);
  assert.equal(normalizeVisitorSecuritySettings({ geoipLicenseKey: "secret" }, { includeSecrets: true, clearLicenseKey: true }).geoipLicenseKey, "");
});
