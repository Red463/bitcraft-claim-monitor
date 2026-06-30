import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

test("app update Discord announcements are checked by a scheduled worker job", () => {
  assert.match(server, /discord_app_update_announcer/);
  assert.match(server, /schedule: "interval@300"/);
  assert.match(server, /runDiscordAppUpdateAnnouncementJob/);
});

test("scheduled app update checks avoid delivery-log spam for already announced releases", () => {
  assert.match(server, /announceDiscordAppUpdateIfNeeded\(\{ recordAlreadyAnnounced: false \}\)/);
  assert.match(server, /recordAlreadyAnnounced = true/);
});

