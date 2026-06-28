import assert from "node:assert/strict";
import test from "node:test";

import { routeGroup, shouldLogVisitor } from "../src/server/httpRoutes.mjs";

test("routeGroup classifies public API, admin, auth, Discord, static, and app routes", () => {
  assert.equal(routeGroup("/api/local/admin/settings"), "admin");
  assert.equal(routeGroup("/api/local/auth/me"), "auth");
  assert.equal(routeGroup("/api/local/user/preferences"), "auth");
  assert.equal(routeGroup("/api/discord/interactions"), "discord");
  assert.equal(routeGroup("/api/bitjita/claims"), "bitjita-proxy");
  assert.equal(routeGroup("/api/local/history"), "local-api");
  assert.equal(routeGroup("/assets/index.js"), "static");
  assert.equal(routeGroup("/favicon.svg"), "static");
  assert.equal(routeGroup("/favicon.ico"), "static");
  assert.equal(routeGroup("/terms"), "app");
});

test("shouldLogVisitor skips only static assets", () => {
  assert.equal(shouldLogVisitor("/assets/index.css"), false);
  assert.equal(shouldLogVisitor("/favicon.ico"), false);
  assert.equal(shouldLogVisitor("/api/local/health"), true);
  assert.equal(shouldLogVisitor("/"), true);
});