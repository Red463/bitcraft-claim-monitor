import assert from "node:assert/strict";
import test from "node:test";

const { loadAdminSettlementMembers } = await import(
  new URL("../src/components/admin/adminSettlementMembers.ts", import.meta.url).href,
);

test("loads members from the provider-neutral game-data route", async () => {
  const requestedUrls = [];
  const members = await loadAdminSettlementMembers("North & West/2", async (url) => {
    requestedUrls.push(url);
    return new Response(JSON.stringify({
      claimId: "North & West/2",
      regionId: "19",
      generatedAt: "2026-07-29T12:00:00.000Z",
      domains: {
        members: {
          data: [{ id: "character-1" }],
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

  assert.deepEqual(requestedUrls, ["/api/local/game-data?claimId=North+%26+West%2F2&domains=members"]);
  assert.deepEqual(members, [{ id: "character-1" }]);
});

test("returns an empty array for a successful response without a member domain", async () => {
  const members = await loadAdminSettlementMembers("claim-1", async () => {
    return new Response(JSON.stringify({
      claimId: "claim-1",
      regionId: "",
      generatedAt: "2026-07-29T12:00:00.000Z",
      domains: {},
      partialErrors: ["members has not loaded yet."],
    }), { status: 200 });
  });

  assert.deepEqual(members, []);
});

test("rejects non-successful responses with the HTTP status", async () => {
  await assert.rejects(
    loadAdminSettlementMembers("claim-1", async () => new Response(null, { status: 503 })),
    new Error("Unable to load game data (HTTP 503)."),
  );
});

test("does not request members for a blank claim ID", async () => {
  let requestCount = 0;
  const members = await loadAdminSettlementMembers("   ", async () => {
    requestCount += 1;
    return new Response(JSON.stringify({ members: [] }), { status: 200 });
  });

  assert.equal(requestCount, 0);
  assert.deepEqual(members, []);
});
