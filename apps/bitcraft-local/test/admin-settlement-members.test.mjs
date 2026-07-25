import assert from "node:assert/strict";
import test from "node:test";

const { loadAdminSettlementMembers } = await import(
  new URL("../src/components/admin/adminSettlementMembers.ts", import.meta.url).href,
);

test("loads members from the configured settlement through the BitJita proxy", async () => {
  const requestedUrls = [];
  const members = await loadAdminSettlementMembers("North & West/2", async (url) => {
    requestedUrls.push(url);
    return new Response(JSON.stringify({ members: [{ id: "character-1" }] }), { status: 200 });
  });

  assert.deepEqual(requestedUrls, ["/api/bitjita/claims/North%20%26%20West%2F2/members"]);
  assert.deepEqual(members, [{ id: "character-1" }]);
});

test("accepts a direct member array response", async () => {
  const members = await loadAdminSettlementMembers("claim-1", async () => {
    return new Response(JSON.stringify([{ id: "character-2" }]), { status: 200 });
  });

  assert.deepEqual(members, [{ id: "character-2" }]);
});

test("returns an empty array for a successful response without a member array", async () => {
  const members = await loadAdminSettlementMembers("claim-1", async () => {
    return new Response(JSON.stringify({ members: null }), { status: 200 });
  });

  assert.deepEqual(members, []);
});

test("rejects non-successful responses with the HTTP status", async () => {
  await assert.rejects(
    loadAdminSettlementMembers("claim-1", async () => new Response(null, { status: 503 })),
    new Error("Unable to load settlement characters (HTTP 503)."),
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
