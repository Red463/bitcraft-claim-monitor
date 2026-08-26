import assert from "node:assert/strict";
import test from "node:test";

let profileClient = null;
try {
  profileClient = await import("../src/api/profile.ts");
} catch {
  // RED: frontend profile selection does not exist yet.
}

test("frontend profile loading selects an isolated root from the server profile response", async () => {
  assert.ok(profileClient, "profile client must exist");
  const requested = [];
  const profile = await profileClient.loadHostProfile(async (url, options) => {
    requested.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        profile: {
          id: "public",
          origin: "https://claim-monitor.com",
          allowsAdmin: false,
          allowsDiscord: false,
        },
        features: {
          publicProfileEnabled: false,
          publicCollaborationEnabled: false,
          publicLegalConfigurationConfirmed: false,
        },
      }),
    };
  });

  assert.equal(profile.id, "public");
  assert.equal(profileClient.rootForProfile(profile), "public");
  assert.deepEqual(requested, [{ url: "/api/profile", options: { cache: "no-store", signal: undefined } }]);
});

test("frontend profile loading rejects malformed and failed server responses", async () => {
  assert.ok(profileClient, "profile client must exist");
  await assert.rejects(profileClient.loadHostProfile(async () => ({ ok: false, status: 421 })), /421/);
  await assert.rejects(profileClient.loadHostProfile(async () => ({
    ok: true,
    json: async () => ({ profile: { id: "public" }, features: {} }),
  })), /profile/i);
});
