import assert from "node:assert/strict";
import test from "node:test";

test("explicit route state wins over a saved browser preference on first render", async () => {
  const persistedState = await import("../src/hooks/usePersistedState.ts");

  assert.equal(typeof persistedState.resolvePersistedInitialValue, "function");
  assert.equal(persistedState.resolvePersistedInitialValue({
    initialValue: "server-health",
    savedValue: '"status"',
    preferInitialValue: true,
  }), "server-health");
  assert.equal(persistedState.resolvePersistedInitialValue({
    initialValue: "server-health",
    savedValue: '"status"',
    preferInitialValue: false,
  }), "status");
});
