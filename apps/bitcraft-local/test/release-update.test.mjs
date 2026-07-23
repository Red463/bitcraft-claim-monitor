import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeAutomaticReleaseUpdate,
  markAutomaticReleaseUpdate,
  normalizeReleaseBuildId,
  releaseUpdateDecision,
} from "../src/utils/releaseUpdate.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("release update decision stores the first build without prompting", () => {
  assert.equal(releaseUpdateDecision({ currentBuildId: "", nextBuildId: "abc123", documentHidden: false }), "remember");
});

test("release update decision ignores unchanged or missing build ids", () => {
  assert.equal(releaseUpdateDecision({ currentBuildId: "abc123", nextBuildId: "abc123", documentHidden: false }), "ignore");
  assert.equal(releaseUpdateDecision({ currentBuildId: "abc123", nextBuildId: "", documentHidden: false }), "ignore");
});

test("release update decision prompts visible tabs and reloads hidden tabs", () => {
  assert.equal(releaseUpdateDecision({ currentBuildId: "abc123", nextBuildId: "def456", documentHidden: false }), "prompt");
  assert.equal(releaseUpdateDecision({ currentBuildId: "abc123", nextBuildId: "def456", documentHidden: true }), "reload");
});

test("release build ids are normalized from health payloads", () => {
  assert.equal(normalizeReleaseBuildId({ buildId: "  abcdef123456  " }), "abcdef123456");
  assert.equal(normalizeReleaseBuildId({ buildId: 123 }), "");
  assert.equal(normalizeReleaseBuildId(null), "");
});

test("automatic update marker is consumed exactly once", () => {
  const storage = memoryStorage();

  assert.equal(markAutomaticReleaseUpdate(storage), true);
  assert.equal(consumeAutomaticReleaseUpdate(storage), true);
  assert.equal(consumeAutomaticReleaseUpdate(storage), false);
});

test("automatic update marker ignores invalid values and unavailable storage", () => {
  const storage = memoryStorage();
  storage.setItem("bitcraft.release.auto-updated", "unexpected");
  assert.equal(consumeAutomaticReleaseUpdate(storage), false);

  const unavailable = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
    removeItem() { throw new Error("storage unavailable"); },
  };
  assert.equal(markAutomaticReleaseUpdate(unavailable), false);
  assert.equal(consumeAutomaticReleaseUpdate(unavailable), false);
});
