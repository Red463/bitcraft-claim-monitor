import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  resolveSmokeAdminReviewMode,
  smokeAdminReviewMutationRejection,
} from "../src/server/smokeAdminReview.mjs";

const repoRoot = path.resolve("C:/workspace/claim-monitor");
const reviewDataDir = path.join(repoRoot, ".codex-dev", "admin-review-data");

test("resolveSmokeAdminReviewMode grants a synthetic owner only for the isolated loopback review server", () => {
  const mode = resolveSmokeAdminReviewMode({
    env: {
      APP_HOST: "127.0.0.1",
      BITCRAFT_SMOKE_ADMIN_BYPASS: "true",
    },
    isProduction: false,
    repoRoot,
    dataDir: reviewDataDir,
  });

  assert.equal(mode.enabled, true);
  assert.equal(mode.user.username, "Smoke review");
  assert.equal(mode.user.role, "owner");
});

test("resolveSmokeAdminReviewMode refuses unsafe activation contexts", () => {
  const base = {
    env: {
      APP_HOST: "127.0.0.1",
      BITCRAFT_SMOKE_ADMIN_BYPASS: "true",
    },
    isProduction: false,
    repoRoot,
    dataDir: reviewDataDir,
  };

  const unsafeContexts = [
    { ...base, isProduction: true },
    { ...base, env: { ...base.env, APP_HOST: "0.0.0.0" } },
    { ...base, dataDir: path.join(repoRoot, ".dev-data") },
    { ...base, env: { ...base.env, BITCRAFT_SMOKE_ADMIN_BYPASS: "false" } },
  ];

  for (const context of unsafeContexts) {
    assert.deepEqual(resolveSmokeAdminReviewMode(context), { enabled: false, user: null });
  }
});

test("smokeAdminReviewMutationRejection blocks every unsafe admin method before route handling", () => {
  const adminRequest = (method, pathname = "/api/local/admin/settings") => ({ method, url: pathname });

  assert.equal(smokeAdminReviewMutationRejection(adminRequest("GET"), { enabled: true }), null);
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("HEAD"), { enabled: true }), null);
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("OPTIONS"), { enabled: true }), null);
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("POST", "/api/local/admin/login"), { enabled: true }), "Smoke administrator review mode is read-only");
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("POST", "/api/local/admin/setup"), { enabled: true }), "Smoke administrator review mode is read-only");
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("PUT"), { enabled: true }), "Smoke administrator review mode is read-only");
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("PATCH"), { enabled: true }), "Smoke administrator review mode is read-only");
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("DELETE"), { enabled: true }), "Smoke administrator review mode is read-only");
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("POST", "/api/local/market/event/resolve"), { enabled: true }), "Smoke administrator review mode is read-only");
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("POST", "/api/local/auth/discord/start"), { enabled: true }), null);
  assert.equal(smokeAdminReviewMutationRejection(adminRequest("POST"), { enabled: false }), null);
});
