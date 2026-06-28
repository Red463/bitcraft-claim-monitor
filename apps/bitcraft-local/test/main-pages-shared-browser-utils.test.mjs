import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const mainPagesSource = readFileSync(new URL("../src/pages/MainPages.tsx", import.meta.url), "utf8");

test("MainPages uses shared browser analytics and navigation helpers", () => {
  assert.match(
    mainPagesSource,
    /import\s+\{\s*updateQueryState\s*\}\s+from\s+"..\/navigation";/,
  );
  assert.match(
    mainPagesSource,
    /import\s+\{\s*trackAnalyticsEvent\s*\}\s+from\s+"..\/utils\/analytics";/,
  );
  assert.doesNotMatch(mainPagesSource, /function\s+trackAnalyticsEvent\s*\(/);
  assert.doesNotMatch(mainPagesSource, /function\s+updateQueryState\s*\(/);
  assert.doesNotMatch(mainPagesSource, /function\s+analyticsSessionId\s*\(/);
});
