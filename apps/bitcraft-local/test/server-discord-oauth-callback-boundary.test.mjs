import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const callbackStart = server.indexOf("async function handleDiscordOAuthCallback");
const callbackEnd = server.indexOf("\nfunction rejectStaleLegalAcceptance", callbackStart);
const callback = server.slice(callbackStart, callbackEnd);

test("Discord callback routes token and profile requests through bounded diagnostics", () => {
  assert.match(callback, /discordOAuthCallbackController\(\{/);
  assert.doesNotMatch(callback, /await fetch\(tokenRequest\.url/);
  assert.doesNotMatch(callback, /await fetch\(profileRequest\.url/);
});

test("Discord callback emits callback and session boundaries without logging request secrets", () => {
  assert.match(callback, /onDiagnostic:\s*logDiscordOAuthDiagnostic/);
  assert.match(callback, /persistSession:\s*async\s*\(profile\)/);
  assert.doesNotMatch(callback, /console\.(?:log|info|warn)\([^)]*(?:code|state|access_token|profile|req\.url)/);
});
