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
import * as firstRunTourModule from "../src/tour/firstRunTour.ts";

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
  assert.equal(typeof firstRunTourModule.effectiveTourSteps, "function");
  assert.equal(firstRunTourModule.effectiveTourSteps(false).some((step) => step.id === "account-access"), false);
  assert.equal(firstRunTourModule.effectiveTourSteps(true).some((step) => step.id === "account-access"), true);
});

test("tour transitions keep prompt, run, skip, and replay visibility deterministic", () => {
  assert.equal(typeof firstRunTourModule.firstRunTourTransition, "function");
  assert.equal(typeof firstRunTourModule.reportedTourVisibility, "function");
  let state = { mode: "idle" };
  state = firstRunTourModule.firstRunTourTransition(state, { type: "prompt" });
  assert.deepEqual(state, { mode: "prompt" });
  state = firstRunTourModule.firstRunTourTransition(state, { type: "start" });
  assert.deepEqual(state, { mode: "running" });
  assert.equal(firstRunTourModule.reportedTourVisibility(true, state), true);
  assert.equal(firstRunTourModule.reportedTourVisibility(false, state), false, "a suspended tour must not keep settings non-modal");
  state = firstRunTourModule.firstRunTourTransition(state, { type: "skip" });
  assert.deepEqual(state, { mode: "idle" });
  state = firstRunTourModule.firstRunTourTransition(state, { type: "replay" });
  assert.deepEqual(state, { mode: "running" });
});

test("missing tour targets are safe and return no spotlight rectangle", () => {
  const documentLike = { querySelector: () => null };
  assert.equal(tourTargetRect(documentLike, FIRST_RUN_TOUR_STEPS[0]), null);
});
