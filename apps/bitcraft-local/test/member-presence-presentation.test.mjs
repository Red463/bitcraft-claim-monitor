import assert from "node:assert/strict";
import test from "node:test";

let presentation = null;
try {
  presentation = await import(
    new URL("../src/pages/memberPresence.ts", import.meta.url).href,
  );
} catch {
  // The red run proves the presentation helper is absent.
}

test("member status prefers confirmed online then newest last-active then last-login then Never", () => {
  assert.ok(presentation, "expected the member-presence presentation module");
  const cases = [{
    input: {
      signedIn: true,
      lastActiveTimestamp: "2026-07-30T11:00:00.000Z",
      lastLoginTimestamp: "2026-07-30T12:00:00.000Z",
    },
    expected: { kind: "online", timestamp: null, label: "Online now" },
  }, {
    input: {
      signedIn: false,
      lastActiveTimestamp: "2026-07-30T11:00:00.000Z",
      lastLoginTimestamp: "2026-07-30T12:00:00.000Z",
    },
    expected: { kind: "last-seen", timestamp: "2026-07-30T11:00:00.000Z", label: "Last seen" },
  }, {
    input: {
      signedIn: false,
      lastActiveTimestamp: "invalid",
      lastLoginTimestamp: "2026-07-30T10:00:00.000Z",
    },
    expected: { kind: "last-seen", timestamp: "2026-07-30T10:00:00.000Z", label: "Last seen" },
  }, {
    input: { signedIn: null },
    expected: { kind: "never", timestamp: null, label: "Never" },
  }];
  for (const entry of cases) {
    assert.deepEqual(presentation.memberPresenceStatus(entry.input), entry.expected);
  }
});

test("unknown presence does not render an offline session", () => {
  assert.ok(presentation, "expected the member-presence presentation module");
  assert.equal(presentation.memberSessionStatus({
    signedIn: null,
    presenceSource: "unavailable",
  }), "Presence unavailable");
  assert.equal(presentation.memberSessionStatus({
    signedIn: false,
    presenceSource: "relay-player",
  }), "Offline");
});
