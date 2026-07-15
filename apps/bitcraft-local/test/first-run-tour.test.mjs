import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  FIRST_RUN_TOUR_SEEN_KEY,
  FIRST_RUN_TOUR_STEPS,
  firstRunTourSeenAfterAction,
  shouldShowFirstRunTourPrompt,
  tourTargetRect,
} from "../src/tour/firstRunTour.ts";

test("first-run tour prompt appears only when unseen and app modals are clear", () => {
  assert.equal(FIRST_RUN_TOUR_SEEN_KEY, "onboarding.firstTourSeen");
  assert.equal(shouldShowFirstRunTourPrompt({ seen: false, blocked: false }), true);
  assert.equal(shouldShowFirstRunTourPrompt({ seen: true, blocked: false }), false);
  assert.equal(shouldShowFirstRunTourPrompt({ seen: false, blocked: true }), false);
  assert.equal(shouldShowFirstRunTourPrompt({ seen: false, blocked: false, active: true }), false);
});

test("decline, start, skip, close, and complete all mark the first-run tour as seen", () => {
  for (const action of ["decline", "start", "skip", "close", "complete"]) {
    assert.equal(firstRunTourSeenAfterAction(action), true, `${action} should mark the tour seen`);
  }
});

test("first-run tour is a short task-based path to useful settlement context", () => {
  assert.ok(FIRST_RUN_TOUR_STEPS.length <= 6, "the first-run tour should take no more than six steps");
  assert.deepEqual(FIRST_RUN_TOUR_STEPS.map((step) => step.id), [
    "purpose-freshness",
    "dashboard-attention",
    "navigation-groups",
    "search-jump",
    "account-access",
    "help-replay",
  ]);
  assert.equal(FIRST_RUN_TOUR_STEPS.every((step) => step.id && step.target && step.title && step.body), true);
  assert.match(FIRST_RUN_TOUR_STEPS[0].body, /fresh|updated|BitJita/i);
  assert.equal(FIRST_RUN_TOUR_STEPS[1].page, "dashboard");
  assert.equal(FIRST_RUN_TOUR_STEPS[1].target, "dashboard-summary");
  assert.match(FIRST_RUN_TOUR_STEPS[1].body, /attention|start/i);
  assert.match(FIRST_RUN_TOUR_STEPS.find((step) => step.id === "search-jump")?.body ?? "", /Craft Planning/);
  assert.match(FIRST_RUN_TOUR_STEPS.find((step) => step.id === "account-access")?.body ?? "", /does not guarantee access/i);
  assert.match(FIRST_RUN_TOUR_STEPS.find((step) => step.id === "help-replay")?.body ?? "", /replay/i);
});

test("account and verification guidance appears only when Discord access is useful", () => {
  const manager = readFileSync(new URL("../src/components/main/FirstRunTourManager.tsx", import.meta.url), "utf8");
  assert.match(manager, /showAccountStep/);
  assert.match(manager, /FIRST_RUN_TOUR_STEPS\.filter\(\(candidate\) => showAccountStep \|\| candidate\.id !== "account-access"\)/);
});

test("missing tour targets are safe and return no spotlight rectangle", () => {
  const documentLike = { querySelector: () => null };
  assert.equal(tourTargetRect(documentLike, FIRST_RUN_TOUR_STEPS[0]), null);
});
