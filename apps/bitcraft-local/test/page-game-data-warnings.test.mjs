import assert from "node:assert/strict";
import test from "node:test";

const warningModule = await import(
  new URL("../src/api/pageGameDataWarnings.ts", import.meta.url).href,
);
const {
  gameDataQualitySummaries,
  groupDomainWarnings,
  pageGameDataWarnings,
} = warningModule;

test("Dashboard ignores missing owner enrichment but preserves operational warnings", () => {
  const warnings = [
    "region-claims: Regional claims missing owner usernames: 999.",
    "research: data is stale.",
  ];
  assert.deepEqual(pageGameDataWarnings("dashboard", warnings), [
    "research: data is stale.",
  ]);
  assert.deepEqual(pageGameDataWarnings("region", warnings), warnings);
});

test("stale-data copy only says refresh continues while a request is active", () => {
  assert.equal(typeof warningModule.staleDataWarning, "function");
  assert.equal(
    warningModule.staleDataWarning({ stale: true, refreshActive: true, lastUpdatedLabel: "10:42:03" }),
    "Showing saved data from 10:42:03 while refresh continues.",
  );
  assert.equal(
    warningModule.staleDataWarning({ stale: true, refreshActive: false, lastUpdatedLabel: "10:42:03" }),
    "Showing saved data from 10:42:03; live refresh is unavailable.",
  );
  assert.equal(
    warningModule.staleDataWarning({ stale: false, refreshActive: false, lastUpdatedLabel: null }),
    "",
  );
});

test("domain quality summaries use affected operational panel labels", () => {
  const partial = (warnings = ["Description unavailable."]) => ({
    generation: 8,
    freshness: "fresh",
    confidence: "partial",
    ageMs: 1_000,
    warnings,
    provenance: null,
    dependencies: {},
  });
  const cases = [
    ["dashboard", "claim", "Dashboard partial (1 warning)"],
    ["skills", "skills", "Professions partial (1 warning)"],
    ["research", "research", "Research partial (1 warning)"],
    ["settlement-market", "market", "Local Market partial (1 warning)"],
    ["region", "region", "Region partial (1 warning)"],
    ["publiccrafts", "public-crafts", "Public Craft Finder partial (1 warning)"],
  ];

  for (const [panel, domain, expected] of cases) {
    assert.deepEqual(gameDataQualitySummaries(panel, { [domain]: partial() }), [expected]);
  }
});

test("domain quality summaries include stale age and grouped warning counts", () => {
  const repeatedWarnings = Array.from(
    { length: 88 },
    (_, index) => `Market listing ${index + 1} is missing a catalog label.`,
  );
  const summaries = gameDataQualitySummaries("dashboard", {
    research: {
      generation: 8,
      freshness: "stale",
      confidence: "authoritative",
      ageMs: 240_000,
      warnings: [],
      provenance: null,
      dependencies: {},
    },
    market: {
      generation: 8,
      freshness: "fresh",
      confidence: "partial",
      ageMs: 1_000,
      warnings: repeatedWarnings,
      provenance: null,
      dependencies: {},
    },
  });

  assert.deepEqual(summaries, [
    "Research stale (4m)",
    "Local Market partial (88 warnings)",
  ]);
  assert.deepEqual(groupDomainWarnings({ market: {
    generation: 8,
    freshness: "fresh",
    confidence: "partial",
    ageMs: 1_000,
    warnings: repeatedWarnings,
    provenance: null,
    dependencies: {},
  } }), [{
    key: "market:Market listing # is missing a catalog label.",
    domain: "market",
    message: "Market listing # is missing a catalog label.",
    count: 88,
    examples: repeatedWarnings.slice(0, 3),
  }]);
});
