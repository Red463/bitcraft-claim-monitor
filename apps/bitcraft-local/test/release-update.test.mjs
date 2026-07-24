import assert from "node:assert/strict";
import test from "node:test";

import {
  LAST_LOADED_RELEASE_BUILD_KEY,
  normalizeReleaseBuildId,
  readLastLoadedReleaseBuild,
  releaseUpdateDecision,
  writeLastLoadedReleaseBuild,
} from "../src/utils/releaseUpdate.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("first visit remembers the running build without an update notice", () => {
  assert.equal(releaseUpdateDecision({
    currentBuildId: "",
    lastLoadedBuildId: "",
    nextBuildId: "abc123",
    documentHidden: false,
  }), "remember");
});

test("a newly loaded build reports one completed update", () => {
  assert.equal(releaseUpdateDecision({
    currentBuildId: "",
    lastLoadedBuildId: "abc123",
    nextBuildId: "def456",
    documentHidden: false,
  }), "updated");
});

test("an old running build prompts visibly and reloads while hidden", () => {
  assert.equal(releaseUpdateDecision({
    currentBuildId: "abc123",
    lastLoadedBuildId: "abc123",
    nextBuildId: "def456",
    documentHidden: false,
  }), "prompt");
  assert.equal(releaseUpdateDecision({
    currentBuildId: "abc123",
    lastLoadedBuildId: "abc123",
    nextBuildId: "def456",
    documentHidden: true,
  }), "reload");
});

test("the running build ignores unchanged and missing server builds", () => {
  assert.equal(releaseUpdateDecision({
    currentBuildId: "abc123",
    lastLoadedBuildId: "abc123",
    nextBuildId: "abc123",
    documentHidden: false,
  }), "ignore");
  assert.equal(releaseUpdateDecision({
    currentBuildId: "abc123",
    lastLoadedBuildId: "abc123",
    nextBuildId: "",
    documentHidden: false,
  }), "ignore");
});

test("release build ids are normalized from health payloads", () => {
  assert.equal(normalizeReleaseBuildId({ buildId: "  abcdef123456  " }), "abcdef123456");
  assert.equal(normalizeReleaseBuildId({ buildId: 123 }), "");
  assert.equal(normalizeReleaseBuildId(null), "");
});

test("last loaded build storage is normalized and best effort", () => {
  const storage = memoryStorage();
  assert.equal(readLastLoadedReleaseBuild(storage), "");
  assert.equal(writeLastLoadedReleaseBuild(storage, "  abc123  "), true);
  assert.equal(storage.getItem(LAST_LOADED_RELEASE_BUILD_KEY), "abc123");
  assert.equal(readLastLoadedReleaseBuild(storage), "abc123");
  assert.equal(writeLastLoadedReleaseBuild(storage, "   "), false);

  const unavailable = {
    getItem() { throw new Error("storage unavailable"); },
    setItem() { throw new Error("storage unavailable"); },
    removeItem() { throw new Error("storage unavailable"); },
  };
  assert.equal(readLastLoadedReleaseBuild(unavailable), "");
  assert.equal(writeLastLoadedReleaseBuild(unavailable, "abc123"), false);
});
