import assert from "node:assert/strict";
import test from "node:test";

let hostProfiles = null;
try {
  hostProfiles = await import("../src/server/public/hostProfiles.mjs");
} catch {
  // RED: the server-owned public host boundary does not exist yet.
}

test("host profiles use exact hosts and trust forwarded hosts only from loopback Caddy", () => {
  assert.ok(hostProfiles, "host profile resolver must exist");

  assert.deepEqual(hostProfiles.resolveHostProfile({ host: "app.timbersteeltrade.com" }, { isProduction: true }), {
    id: "timbersteel",
    origin: "https://app.timbersteeltrade.com",
    allowsAdmin: true,
    allowsDiscord: true,
  });
  assert.deepEqual(hostProfiles.resolveHostProfile({ host: "claim-monitor.com" }, { isProduction: true }), {
    id: "public",
    origin: "https://claim-monitor.com",
    allowsAdmin: false,
    allowsDiscord: false,
  });
  assert.equal(hostProfiles.resolveHostProfile({ host: "claim-monitor.com.evil.example" }, { isProduction: true }), null);
  assert.equal(hostProfiles.resolveHostProfile({ host: "public.localhost" }, { isProduction: true }), null);
  assert.equal(hostProfiles.resolveHostProfile({ host: "public.localhost" }, { isProduction: false })?.id, "public");

  assert.equal(hostProfiles.resolveHostProfile({
    host: "app.timbersteeltrade.com",
    forwardedHost: "claim-monitor.com",
    remoteAddress: "203.0.113.9",
  }, { isProduction: true })?.id, "timbersteel");
  assert.equal(hostProfiles.resolveHostProfile({
    host: "app.timbersteeltrade.com",
    forwardedHost: "claim-monitor.com",
    remoteAddress: "127.0.0.1",
  }, { isProduction: true })?.id, "public");
});
