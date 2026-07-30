import assert from "node:assert/strict";
import test from "node:test";

let math = null;
try {
  math = await import("../src/pages/publicCraftMath.ts");
} catch {
  // The first TDD run proves the exact public-craft arithmetic module is absent.
}

test("public craft remaining effort stays exact beyond Number safe integer range", () => {
  assert.ok(math, "public craft exact arithmetic module must exist");
  assert.equal(
    math.remainingCraftEffort("108086391056891916", "10"),
    "108086391056891906",
  );
  assert.equal(math.remainingCraftEffort("5", "8"), "0");
  assert.equal(math.remainingCraftEffort(null, "8"), null);
});

test("public craft effort comparison and formatting do not round decimal integers", () => {
  assert.ok(math, "public craft exact arithmetic module must exist");
  assert.equal(
    math.compareCraftEffort("9007199254740993", "9007199254740992"),
    1,
  );
  assert.equal(
    math.formatCraftEffort("108086391056891906", "en-US"),
    "108,086,391,056,891,906",
  );
});
