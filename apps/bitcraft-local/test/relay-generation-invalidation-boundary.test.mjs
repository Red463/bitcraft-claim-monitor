import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("generic page data reloads when its provider-neutral generation commits and retains last good data on failure", () => {
  const loader = source("../src/api/gameDataLoader.ts");

  assert.match(loader, /import \{ useGameDataGeneration \} from "\.\.\/hooks\/useGameDataGeneration";/);
  assert.match(loader, /const domains = pageDomains\(activePanel\);\s*const generation = useGameDataGeneration\(claimId, domains\);/s);
  assert.match(loader, /\}, \[\s*activePanel,\s*claimId,\s*generation,/s);
  assert.match(loader, /setState\(\(previous\) => \(\{[\s\S]*data: previous\.data,[\s\S]*stale: Boolean\(previous\.data\) \|\| previous\.stale,/);
});

test("Empire overview, watchtowers, details, and claim members consume the empires generation", () => {
  const page = source("../src/pages/EmpiresPage.tsx");
  const details = source("../src/pages/empires/EmpireDetailsDialog.tsx");

  assert.match(page, /import \{ useGameDataGeneration \} from "\.\.\/hooks\/useGameDataGeneration";/);
  assert.match(page, /const empireGeneration = useGameDataGeneration\(monitoredClaimId, \["empires"\]\);/);
  assert.match(page, /\[currentTab, empireGeneration, regionId, request\?\.sequence, trackPromise\]/);
  assert.match(page, /\[currentTab, empireGeneration, inactiveDays, regionId, request\?\.sequence, trackPromise\]/);
  assert.match(page, /<EmpireDetailsDialog[\s\S]*generation=\{empireGeneration\}/);
  assert.match(page, /<ClaimMembersDialog[\s\S]*generation=\{empireGeneration\}/);
  assert.match(page, /\[claim\.claimId, generation, request\?\.sequence, trackPromise\]/);
  assert.match(details, /generation: number;/);
  assert.match(details, /\[cacheKey, empireId, generation, inactiveDays, regionId, retry, request\?\.sequence, trackPromise\]/);
  assert.match(details, /if \(!request && cached && retry === 0 && generation === 0\)/);
});

test("the retired browser snapshot writer and its settings plumbing are absent", () => {
  const appShell = source("../src/AppShell.tsx");
  const defaults = source("../src/settingsDefaults.ts");
  const settings = source("../src/types/settings.ts");
  const server = source("../server.mjs");

  assert.doesNotMatch(appShell, /\/api\/local\/snapshot|browserSnapshotsEnabled/);
  assert.doesNotMatch(defaults, /browserSnapshotsEnabled/);
  assert.doesNotMatch(settings, /browserSnapshotsEnabled/);
  assert.doesNotMatch(server, /browserSnapshotsEnabled/);
});
