import assert from "node:assert/strict";
import test from "node:test";

let interactions = {};
try {
  interactions = await import("../src/server/discordCraftPlanInteractions.mjs");
} catch {}

test("authorized Craft Planner commands defer before slow report work starts", async () => {
  assert.equal(typeof interactions.preflightCraftPlanInteraction, "function");
  assert.equal(typeof interactions.deferredDiscordInteractionResult, "function");

  const preflight = interactions.preflightCraftPlanInteraction({
    member: { roles: ["planner-role"], permissions: "0" },
    data: { options: [{ name: "profession", value: "farming" }] },
  }, "planner-role");
  assert.deepEqual(preflight, { ok: true, profession: "Farming" });

  let workStarted = false;
  let releaseWork;
  const work = new Promise((resolve) => { releaseWork = resolve; });
  const startedAt = performance.now();
  const result = interactions.deferredDiscordInteractionResult(async () => {
    workStarted = true;
    await work;
  });

  assert.ok(performance.now() - startedAt < 100);
  assert.deepEqual(result.body, {
    type: 5,
    data: { allowed_mentions: { parse: [] } },
  });
  assert.equal(workStarted, false);

  const afterResponse = result.afterResponse();
  assert.equal(workStarted, true);
  releaseWork();
  await afterResponse;
});

test("Craft Planner command preflight allows administrators and rejects unauthorized members", () => {
  assert.equal(typeof interactions.preflightCraftPlanInteraction, "function");
  assert.deepEqual(interactions.preflightCraftPlanInteraction({ member: { roles: [], permissions: "8" }, data: {} }, "planner-role"), {
    ok: true,
    profession: "",
  });
  assert.deepEqual(interactions.preflightCraftPlanInteraction({ member: { roles: [], permissions: "0" }, data: {} }, "planner-role"), {
    ok: false,
    error: "You need the configured Craft Planner report role to use this command.",
  });
  assert.deepEqual(interactions.preflightCraftPlanInteraction({ member: { roles: [], permissions: "0" }, data: {} }, ""), {
    ok: false,
    error: "Craft Planner report command access has not been configured yet.",
  });
});

test("Craft Planner command preflight rejects unknown professions", () => {
  assert.equal(typeof interactions.preflightCraftPlanInteraction, "function");
  assert.deepEqual(interactions.preflightCraftPlanInteraction({
    member: { roles: ["planner-role"], permissions: "0" },
    data: { options: [{ name: "profession", value: "alchemy" }] },
  }, "planner-role"), {
    ok: false,
    error: "That profession is not available.",
  });
});

test("interaction webhook edits use JSON without bot authorization", async () => {
  assert.equal(typeof interactions.editDiscordInteractionOriginal, "function");
  let request;
  const response = await interactions.editDiscordInteractionOriginal({
    applicationId: "123456789012345678",
    interactionToken: "interaction-secret",
    data: { embeds: [{ title: "Crafting Progress" }] },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: "message-1" }) };
    },
  });

  assert.equal(request.url, "https://discord.com/api/v10/webhooks/123456789012345678/interaction-secret/messages/@original");
  assert.equal(request.options.method, "PATCH");
  assert.equal(request.options.headers["content-type"], "application/json");
  assert.equal("authorization" in request.options.headers, false);
  assert.deepEqual(JSON.parse(request.options.body), {
    embeds: [{ title: "Crafting Progress" }],
    allowed_mentions: { parse: [] },
  });
  assert.deepEqual(response, { id: "message-1" });
});

test("interaction webhook errors never expose interaction tokens", async () => {
  assert.equal(typeof interactions.editDiscordInteractionOriginal, "function");
  await assert.rejects(
    interactions.editDiscordInteractionOriginal({
      applicationId: "123456789012345678",
      interactionToken: "interaction-secret",
      data: {},
      fetchImpl: async () => ({ ok: false, status: 404, text: async () => "interaction-secret was rejected" }),
    }),
    (error) => {
      assert.match(error.message, /Discord interaction webhook HTTP 404/);
      assert.doesNotMatch(error.message, /interaction-secret|rejected/);
      assert.ok(error.message.length < 120);
      return true;
    },
  );
});

test("interaction webhook network failures are replaced with a token-safe error", async () => {
  await assert.rejects(
    interactions.editDiscordInteractionOriginal({
      applicationId: "123456789012345678",
      interactionToken: "interaction-secret",
      data: {},
      fetchImpl: async () => { throw new Error("fetch interaction-secret failed"); },
    }),
    (error) => {
      assert.equal(error.message, "Discord interaction webhook request failed");
      assert.doesNotMatch(error.message, /interaction-secret/);
      return true;
    },
  );
});
