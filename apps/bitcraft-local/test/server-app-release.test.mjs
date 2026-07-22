import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { currentAppAnnouncementKey, currentAppBuildId, currentAppReleaseKey, releaseVersionAlreadyAnnounced } from "../src/server/appRelease.mjs";

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

test("currentAppBuildId follows linked worktree gitdir pointers", () => {
  const revision = "abcdef1234567890abcdef1234567890abcdef12";
  const absoluteReads = new Map([
    ["C:/release/.git", "gitdir: C:/source/.git/worktrees/release-abc\n"],
    ["C:/source/.git/worktrees/release-abc/HEAD", `${revision}\n`],
  ]);
  const relativeReads = new Map([
    ["C:/release/.git", "gitdir: ../source/.git/worktrees/release-abc\n"],
    ["C:/source/.git/worktrees/release-abc/HEAD", `${revision}\n`],
  ]);
  const options = (reads, isAbsolutePath, resolvePath) => ({
    env: {},
    repoRoot: "C:/release",
    readFileSync: (filePath) => {
      if (!reads.has(filePath)) throw new Error(`Missing fixture path: ${filePath}`);
      return reads.get(filePath);
    },
    joinPath: (...parts) => parts.join("/"),
    isAbsolutePath,
    resolvePath,
  });

  assert.equal(currentAppBuildId(options(absoluteReads, (value) => value.startsWith("C:/"), (root, value) => `${root}/${value}`)), "abcdef123456");
  assert.equal(currentAppBuildId(options(relativeReads, () => false, () => "C:/source/.git/worktrees/release-abc")), "abcdef123456");
});

test("currentAppBuildId follows a linked worktree symbolic HEAD through commondir", () => {
  const revision = "abcdef1234567890abcdef1234567890abcdef12";
  const reads = new Map([
    ["C:/release/.git", "gitdir: C:/source/.git/worktrees/release-abc\n"],
    ["C:/source/.git/worktrees/release-abc/HEAD", "ref: refs/heads/codex/release-abc\n"],
    ["C:/source/.git/worktrees/release-abc/commondir", "../..\n"],
    ["C:/source/.git/refs/heads/codex/release-abc", `${revision}\n`],
  ]);

  const buildId = currentAppBuildId({
    env: {},
    repoRoot: "C:/release",
    readFileSync: (filePath) => {
      if (!reads.has(filePath)) throw new Error(`Missing fixture path: ${filePath}`);
      return reads.get(filePath);
    },
    joinPath: (...parts) => parts.join("/"),
    isAbsolutePath: (value) => value.startsWith("C:/"),
    resolvePath: (root, value) => value === "../.." ? "C:/source/.git" : `${root}/${value}`,
  });

  assert.equal(buildId, "abcdef123456");
});

test("currentAppReleaseKey appends the build id when available", () => {
  assert.equal(currentAppReleaseKey({ appVersion: "1.0.0-beta.41", buildId: "abcdef123456" }), "1.0.0-beta.41+abcdef123456");
  assert.equal(currentAppReleaseKey({ appVersion: "1.0.0-beta.41", buildId: "" }), "1.0.0-beta.41");
});

test("app update announcements dedupe by app version instead of rebuild id", () => {
  assert.equal(currentAppAnnouncementKey({ appVersion: "1.0.0-beta.114", buildId: "abcdef123456" }), "1.0.0-beta.114");
  assert.equal(releaseVersionAlreadyAnnounced({ lastAnnounced: "1.0.0-beta.114+oldbuild", appVersion: "1.0.0-beta.114" }), true);
  assert.equal(releaseVersionAlreadyAnnounced({ lastAnnounced: "1.0.0-beta.113+oldbuild", appVersion: "1.0.0-beta.114" }), false);
});
test("health route exposes public version and build id", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

  assert.match(server, /url\.pathname === "\/api\/local\/health"/);
  assert.match(server, /version:\s*appVersion/);
  assert.match(server, /buildId:\s*currentAppBuildId\(\)/);
});
