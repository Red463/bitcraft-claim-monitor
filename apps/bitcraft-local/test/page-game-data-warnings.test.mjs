import assert from "node:assert/strict";
import test from "node:test";

const warningModule = await import(
  new URL("../src/api/pageGameDataWarnings.ts", import.meta.url).href,
);
const { pageGameDataWarnings } = warningModule;

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
