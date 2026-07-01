import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const versionPattern = /^0\.(\d+)\.(\d+)-beta\.(\d+)$/;

function parseBetaVersion(version) {
  const match = version.match(versionPattern);
  assert.ok(match, `Expected ${version} to match 0.MINOR.PATCH-beta.N`);
  return {
    minor: Number(match[1]),
    patch: Number(match[2]),
    beta: Number(match[3]),
  };
}

function compareBetaVersions(a, b) {
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  return a.beta - b.beta;
}

test("versioning docs describe the pre-1.0 beta policy used by agents", () => {
  const versioning = readFileSync(new URL("../../../VERSIONING.md", import.meta.url), "utf8");
  const agents = readFileSync(new URL("../../../AGENTS.md", import.meta.url), "utf8");

  assert.match(versioning, /0\.MINOR\.PATCH-beta\.N/);
  assert.match(versioning, /Reset `N` to `1` whenever `MINOR` or `PATCH` changes/);
  assert.match(versioning, /Historical changelog entries were migrated to this policy/);
  assert.match(agents, /Use the pre-1\.0 SemVer beta format from `VERSIONING\.md`: `0\.MINOR\.PATCH-beta\.N`/);
  assert.match(agents, /Update `apps\/bitcraft-local\/package\.json` to match the latest changelog version/);
  assert.doesNotMatch(agents, /1\.0\.0-beta\.41/);
});

test("changelog headings and package version use the current beta policy", () => {
  const changelog = readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8");
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const headings = [...changelog.matchAll(/^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/gm)].map((match) => ({
    version: match[1],
    date: match[2],
    parsed: parseBetaVersion(match[1]),
  }));

  assert.ok(headings.length > 0, "Expected changelog release headings");
  assert.equal(packageJson.version, headings[0].version);
  assert.match(packageJson.version, versionPattern);
  assert.doesNotMatch(changelog, /\[1\.0\.0-beta\.\d+\]/);

  for (let index = 1; index < headings.length; index += 1) {
    const previous = headings[index - 1];
    const current = headings[index];
    assert.ok(compareBetaVersions(previous.parsed, current.parsed) >= 0, `${previous.version} should sort after ${current.version}`);
    assert.ok(previous.date >= current.date, `${previous.date} should not appear before ${current.date}`);
  }
});