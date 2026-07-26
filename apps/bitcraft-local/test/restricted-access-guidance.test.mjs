import assert from "node:assert/strict";
import test from "node:test";

let restrictedAccessGuidance = () => undefined;
try {
  ({ restrictedAccessGuidance } = await import("../src/access/restrictedAccess.ts"));
} catch {
  // RED begins before the focused guidance module exists.
}

const user = (characterStatus = "unlinked") => ({
  id: 1,
  discordId: "123456789",
  username: "settler",
  globalName: "Settler",
  avatarUrl: null,
  characterPlayerId: "",
  characterName: "",
  characterStatus,
  settings: {},
});

test("anonymous restricted users are directed to Discord sign-in when it is available", () => {
  assert.deepEqual(
    restrictedAccessGuidance({ mode: "discord" }, null, true),
    {
      message: "Sign in with Discord to check your access.",
      action: "discord-login",
    },
  );
});

test("anonymous restricted users get an operational fallback when Discord sign-in is unavailable", () => {
  assert.deepEqual(
    restrictedAccessGuidance({ mode: "verified" }, null, false),
    {
      message: "Discord sign-in is currently unavailable. Contact an administrator for access.",
      action: null,
    },
  );
});

test("unlinked and rejected users can open settings to request character approval", () => {
  for (const status of ["unlinked", "rejected"]) {
    assert.deepEqual(
      restrictedAccessGuidance({ mode: "verified" }, user(status), true),
      {
        message: status === "rejected"
          ? "Open User Settings, select your BitCraft character, and request approval again."
          : "Open User Settings, select your BitCraft character, and request approval.",
        action: "user-settings",
      },
    );
  }
});

test("pending users are told that administrator approval is outstanding", () => {
  assert.deepEqual(
    restrictedAccessGuidance({ mode: "verified" }, user("pending"), true),
    {
      message: "Your character link is awaiting administrator approval.",
      action: null,
    },
  );
});

test("unexpected verified denials and specific-user denials direct users to an administrator", () => {
  assert.deepEqual(
    restrictedAccessGuidance({ mode: "verified" }, user("approved"), true),
    {
      message: "Your verified character does not currently have access. Contact an administrator.",
      action: null,
    },
  );
  assert.deepEqual(
    restrictedAccessGuidance({ mode: "specificUsers" }, user("approved"), true),
    {
      message: "Ask an administrator to add your Discord account to this page's allow list.",
      action: null,
    },
  );
});

test("unknown restricted modes fail closed to administrator guidance", () => {
  assert.deepEqual(
    restrictedAccessGuidance({ mode: "future-mode" }, user(), true),
    {
      message: "Contact an administrator to request access.",
      action: null,
    },
  );
});
