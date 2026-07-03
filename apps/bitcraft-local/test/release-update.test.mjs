import assert from "node:assert/strict";
import test from "node:test";

import { releaseUpdateDecision, normalizeReleaseBuildId } from "../src/utils/releaseUpdate.ts";

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