# Native Map Resource Framing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a newly selected resource layer immediately discoverable when all returned locations are outside the current viewport.

**Architecture:** Add a small pure helper that decides whether a selection is ready to consume and whether it needs framing. `NativeMap` retains the last consumed resource-selection key and calls Leaflet `fitBounds` at most once for each non-empty selection.

**Tech Stack:** React, TypeScript, Leaflet 1.9, Node test runner.

## Global Constraints

- Preserve manual pan and zoom after the first framing decision.
- Do not reframe on live generations for an unchanged selection.
- Do not change enemy behavior or Relay collection.

---

### Task 1: Resource framing decision

**Files:**
- Create: `apps/bitcraft-local/src/pages/map/resourceViewport.mjs`
- Create: `apps/bitcraft-local/test/map-resource-viewport.test.mjs`

**Interfaces:**
- Produces: `resourceViewportDecision({ selectionKey, consumedSelectionKey, points, isVisible })` returning `"wait"`, `"preserve"`, or `"frame"`.

- [ ] Write tests for empty, loading, visible, off-screen, and already-consumed selections.
- [ ] Run the focused test and confirm it fails because the helper is missing.
- [ ] Implement the smallest pure helper.
- [ ] Run the focused test and confirm it passes.

### Task 2: Leaflet integration

**Files:**
- Modify: `apps/bitcraft-local/src/pages/map/NativeMap.tsx`
- Modify: `apps/bitcraft-local/test/map-page-boundary.test.mjs`

**Interfaces:**
- Consumes: `resourceViewportDecision` from Task 1.

- [ ] Add a boundary regression test requiring a retained selection key and bounded `fitBounds` call.
- [ ] Run the boundary test and confirm the new assertion fails.
- [ ] Integrate the helper after resource points are installed on the dense layer.
- [ ] Run focused map tests and production build.
- [ ] Select a live resource in the smoke browser and confirm markers become visible without repeated reframing.
