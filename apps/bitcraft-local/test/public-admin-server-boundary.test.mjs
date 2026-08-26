import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("Public service Admin routes remain inside the current Timbersteel Admin guard", () => {
  assert.match(server, /const publicAdminRequest = createPublicAdminRouter\(/);
  assert.match(server, /if \(url\.pathname\.startsWith\("\/api\/local\/admin\/"\)\) \{[\s\S]*?const user = requireAdmin\(req, res\);[\s\S]*?requireAdminMutation\(req, res, user\)[\s\S]*?requireAdminPermission\(req, res, user, requiredPermission\)[\s\S]*?publicAdminRequest\(\{ req, res, user, method: req\.method, url \}\)/);
});

test("Public service Admin health uses sanitized runtime status sources", () => {
  assert.match(server, /publicDataService\.health\(\)/);
  assert.match(server, /rateLimit\.stats\(\)/);
  assert.match(server, /routePerformanceTelemetry\.snapshot\(\)\.rateLimits/);
  assert.doesNotMatch(server, /healthSnapshot:[\s\S]{0,800}(?:botToken|clientSecret|tokenHmacKey)/);
});
