import assert from "node:assert/strict";
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

test("tour steps include page navigation metadata for the full app overview", () => {
  const pages = new Set(FIRST_RUN_TOUR_STEPS.map((step) => step.page));
  for (const page of ["dashboard", "leaderboard", "members", "skills", "production", "inventory", "construction", "research", "market", "empire", "empires", "map", "activity", "publiccrafts", "craftcalc", "sync"]) {
    assert.equal(pages.has(page), true, `expected a tour step for ${page}`);
  }
  assert.equal(FIRST_RUN_TOUR_STEPS.every((step) => step.id && step.target && step.title && step.body), true);
  assert.equal(FIRST_RUN_TOUR_STEPS.find((step) => step.id === "refresh")?.placement, "center");
  assert.equal(FIRST_RUN_TOUR_STEPS.find((step) => step.id === "research")?.body, "Research shows what is already researched and what is still available to unlock.");
  assert.equal(FIRST_RUN_TOUR_STEPS.find((step) => step.id === "user-settings")?.target, "user-settings");
  assert.equal(FIRST_RUN_TOUR_STEPS.find((step) => step.id === "user-settings")?.action, "settings");
});

test("missing tour targets are safe and return no spotlight rectangle", () => {
  const documentLike = { querySelector: () => null };
  assert.equal(tourTargetRect(documentLike, FIRST_RUN_TOUR_STEPS[0]), null);
});
