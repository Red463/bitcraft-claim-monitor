import assert from "node:assert/strict";
import test from "node:test";

import { discordEmbedForActivity } from "../src/server/discordEmbeds.mjs";

test("craft embeds include configured profession emoji in title and profession field", () => {
  const embed = discordEmbedForActivity(
    "production_started",
    "Craft started: Simple Plank",
    "2026-07-02T12:00:00.000Z",
    { skillName: "Carpentry", professionKey: "carpentry", buildingName: "Carpentry Station" },
    { craftEmojis: { carpentry: "<:carpentry:123456789012345678>" } },
  );

  assert.equal(embed.title, "<:carpentry:123456789012345678> Craft Started");
  assert.equal(embed.fields.find((field) => field.name === "Profession")?.value, "<:carpentry:123456789012345678> Carpentry");
});

test("craft embeds fall back to plain titles when no profession emoji is configured", () => {
  const embed = discordEmbedForActivity(
    "production_completed",
    "Craft completed: Simple Plank",
    "2026-07-02T12:00:00.000Z",
    { skillName: "Carpentry", professionKey: "carpentry" },
    { craftEmojis: {} },
  );

  assert.equal(embed.title, "Craft Completed");
  assert.equal(embed.fields.find((field) => field.name === "Profession")?.value, "Carpentry");
});

test("non-production embeds do not use profession emojis", () => {
  const embed = discordEmbedForActivity(
    "market_sale",
    "Market sale: Simple Plank",
    "2026-07-02T12:00:00.000Z",
    { skillName: "Carpentry", professionKey: "carpentry", itemName: "Simple Plank" },
    { craftEmojis: { carpentry: "<:carpentry:123456789012345678>" } },
  );

  assert.equal(embed.title, "Market Sale");
  assert.equal(embed.fields.find((field) => field.name === "Profession")?.value, "Carpentry");
  assert.doesNotMatch(JSON.stringify(embed), /<:carpentry:123456789012345678>/);
});