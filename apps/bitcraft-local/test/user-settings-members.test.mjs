import assert from "node:assert/strict";
import test from "node:test";

let resolveUserSettingsMembers;
try {
  ({ resolveUserSettingsMembers } = await import(
    new URL("../src/api/settlementMembers.ts", import.meta.url).href
  ));
} catch {
  // RED: the shared Settings roster loader does not exist yet.
}

test("User Settings loads settlement characters when the active page supplied no members", async () => {
  assert.equal(typeof resolveUserSettingsMembers, "function", "Settings needs an independent member fallback");

  const requestedUrls = [];
  const members = await resolveUserSettingsMembers([], "claim-1", async (url) => {
    requestedUrls.push(url);
    return new Response(JSON.stringify({
      claimId: "claim-1",
      regionId: "19",
      generatedAt: "2026-07-29T12:00:00.000Z",
      domains: {
        members: {
          data: [
            { playerEntityId: "101", userName: "Modular" },
            { playerEntityId: "102", userName: "Mosswick" },
          ],
          freshness: "fresh",
          confidence: "joined",
          ageMs: 0,
          provenance: { receivedAt: "2026-07-29T12:00:00.000Z" },
          warnings: [],
        },
      },
      partialErrors: [],
    }), { status: 200 });
  });

  assert.deepEqual(requestedUrls, ["/api/local/game-data?claimId=claim-1&domains=members"]);
  assert.deepEqual(members, [
    { playerEntityId: "101", userName: "Modular" },
    { playerEntityId: "102", userName: "Mosswick" },
  ]);
});

test("User Settings reuses members already loaded by the active page", async () => {
  assert.equal(typeof resolveUserSettingsMembers, "function", "Settings needs an independent member fallback");

  const currentMembers = [{ playerEntityId: "101", userName: "Modular" }];
  let requestCount = 0;
  const members = await resolveUserSettingsMembers(currentMembers, "claim-1", async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ members: [] }), { status: 200 });
  });

  assert.equal(requestCount, 0);
  assert.equal(members, currentMembers);
});
