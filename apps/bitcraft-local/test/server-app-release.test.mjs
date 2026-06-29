import assert from "node:assert/strict";
import test from "node:test";

import { currentAppBuildId, currentAppReleaseKey } from "../src/server/appRelease.mjs";

test("currentAppBuildId prefers release environment revisions in deploy order", () => {
  assert.equal(currentAppBuildId({ env: { SOURCE_VERSION: "abcdef1234567890" } }), "abcdef123456");
  assert.equal(currentAppBuildId({ env: { RENDER_GIT_COMMIT: "1234567890abcdef" } }), "1234567890ab");
  assert.equal(currentAppBuildId({ env: { GITHUB_SHA: "fedcba9876543210" } }), "fedcba987654");
});

test("currentAppBuildId reads the checked-out git ref when no release env is present", () => {
  const reads = new Map([
    ["C:/repo/.git/HEAD", "ref: refs/heads/main\n"],
    ["C:/repo/.git/refs/heads/main", "0123456789abcdef0123456789abcdef01234567\n"],
  ]);

  const buildId = currentAppBuildId({
    env: {},
    repoRoot: "C:/repo",
    readFileSync: (filePath) => reads.get(filePath),
    joinPath: (...parts) => parts.join("/"),
  });

  assert.equal(buildId, "0123456789ab");
});

test("currentAppBuildId reads detached HEAD commits and safely falls back", () => {
  assert.equal(currentAppBuildId({
    env: {},
    repoRoot: "C:/repo",
    readFileSync: () => "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n",
    joinPath: (...parts) => parts.join("/"),
  }), "aaaaaaaaaaaa");

  assert.equal(currentAppBuildId({
    env: {},
    repoRoot: "C:/repo",
    readFileSync: () => {
      throw new Error("missing git metadata");
    },
    joinPath: (...parts) => parts.join("/"),
  }), "");
});

test("currentAppReleaseKey appends the build id when available", () => {
  assert.equal(currentAppReleaseKey({ appVersion: "1.0.0-beta.41", buildId: "abcdef123456" }), "1.0.0-beta.41+abcdef123456");
  assert.equal(currentAppReleaseKey({ appVersion: "1.0.0-beta.41", buildId: "" }), "1.0.0-beta.41");
});
