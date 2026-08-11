import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { createServer as createViteServer } from "vite";

function findElements(node, predicate, matches = []) {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, matches);
    return matches;
  }
  if (!React.isValidElement(node)) return matches;
  if (predicate(node)) matches.push(node);
  findElements(node.props.children, predicate, matches);
  return matches;
}

function elementText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(elementText).join("");
  return React.isValidElement(node) ? elementText(node.props.children) : "";
}

function dependenciesChanged(previous, next) {
  if (!previous || !next || previous.length !== next.length) return true;
  return next.some((value, index) => !Object.is(value, previous[index]));
}

function installHookHarness(refreshContext) {
  const originals = {
    useCallback: React.useCallback,
    useContext: React.useContext,
    useEffect: React.useEffect,
    useMemo: React.useMemo,
    useRef: React.useRef,
    useState: React.useState,
  };
  const hooks = [];
  let cursor = 0;
  let effects = [];

  React.useContext = () => refreshContext.current;
  React.useCallback = (callback, dependencies) => {
    const index = cursor++;
    if (!hooks[index] || dependenciesChanged(hooks[index].dependencies, dependencies)) hooks[index] = { value: callback, dependencies };
    return hooks[index].value;
  };
  React.useMemo = (calculate, dependencies) => {
    const index = cursor++;
    if (!hooks[index] || dependenciesChanged(hooks[index].dependencies, dependencies)) hooks[index] = { value: calculate(), dependencies };
    return hooks[index].value;
  };
  React.useRef = (initial) => {
    const index = cursor++;
    if (!hooks[index]) hooks[index] = { value: { current: initial } };
    return hooks[index].value;
  };
  React.useState = (initial) => {
    const index = cursor++;
    if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
    return [hooks[index].value, (update) => {
      hooks[index].value = typeof update === "function" ? update(hooks[index].value) : update;
    }];
  };
  React.useEffect = (effect, dependencies) => {
    const index = cursor++;
    if (!hooks[index] || dependenciesChanged(hooks[index].dependencies, dependencies)) {
      hooks[index] = { dependencies };
      effects.push(effect);
    }
  };

  return {
    async render(Component, props) {
      cursor = 0;
      effects = [];
      const tree = Component(props);
      for (const effect of effects) effect();
      await new Promise((resolve) => setImmediate(resolve));
      return tree;
    },
    restore() {
      Object.assign(React, originals);
    },
  };
}

test("regular page refreshes do not reload an open Craft Plan manager draft", async () => {
  const appRoot = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  const refreshContext = {
    current: { cycle: { id: "cycle-1", page: "planning", sequence: 1 }, trackPromise: (_key, promise) => promise },
  };
  const harness = installHookHarness(refreshContext);
  const originalFetch = globalThis.fetch;
  let managerLoads = 0;
  let releaseRefresh;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/local/admin/craft-plan")) {
      managerLoads += 1;
      if (managerLoads === 2) await new Promise((resolve) => { releaseRefresh = resolve; });
    }
    return { ok: true, json: async () => ({ config: { name: "Saved plan", targets: [], sourceRules: {} }, sources: {} }) };
  };
  try {
    const { CraftPlanManagerDialog } = await vite.ssrLoadModule("/src/pages/CraftPlanManagerDialog.tsx");
    const props = { open: true, onClose() {}, csrfToken: "csrf", onSaved() {} };
    await harness.render(CraftPlanManagerDialog, props);
    assert.equal(managerLoads, 1);
    const cleanTree = await harness.render(CraftPlanManagerDialog, props);
    const explicitRefresh = findElements(cleanTree, (element) => element.type === "button" && elementText(element).trim() === "Refresh")[0];
    explicitRefresh.props.onClick();
    assert.equal(managerLoads, 2, "a clean explicit Refresh should reload immediately");
    const refreshingTree = await harness.render(CraftPlanManagerDialog, props);
    const sessionFieldset = findElements(refreshingTree, (element) => element.type === "fieldset" && element.props.className === "craft-plan-manager-session")[0];
    assert.equal(sessionFieldset.props.disabled, true, "editing controls must be disabled while Refresh is in flight");
    releaseRefresh();
    await new Promise((resolve) => setImmediate(resolve));

    let draftTree = await harness.render(CraftPlanManagerDialog, props);
    const nameInput = findElements(draftTree, (element) => element.type === "input" && element.props.value === "Saved plan")[0];
    nameInput.props.onChange({ target: { value: "Unsaved plan" } });

    refreshContext.current = { cycle: { id: "cycle-2", page: "planning", sequence: 2 }, trackPromise: (_key, promise) => promise };
    draftTree = await harness.render(CraftPlanManagerDialog, props);
    assert.equal(managerLoads, 2, "the regular page cycle must not replace the open manager session");
    assert.ok(findElements(draftTree, (element) => element.type === "input" && element.props.value === "Unsaved plan")[0], "the manager draft must survive a regular page cycle");
  } finally {
    globalThis.fetch = originalFetch;
    harness.restore();
    await vite.close();
  }
});

test("explicit Refresh requires confirmation before discarding a changed manager draft", async () => {
  const appRoot = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  const refreshContext = { current: { cycle: null, trackPromise: (_key, promise) => promise } };
  const harness = installHookHarness(refreshContext);
  const originalFetch = globalThis.fetch;
  let managerLoads = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/local/admin/craft-plan")) managerLoads += 1;
    return { ok: true, json: async () => ({ config: { name: "Saved plan", targets: [], sourceRules: {} }, sources: {} }) };
  };
  try {
    const { CraftPlanManagerDialog } = await vite.ssrLoadModule("/src/pages/CraftPlanManagerDialog.tsx");
    const props = { open: true, onClose() {}, csrfToken: "csrf", onSaved() {} };
    await harness.render(CraftPlanManagerDialog, props);
    let tree = await harness.render(CraftPlanManagerDialog, props);
    const nameInput = findElements(tree, (element) => element.type === "input" && element.props.value === "Saved plan")[0];
    assert.ok(nameInput);
    nameInput.props.onChange({ target: { value: "Unsaved plan" } });

    tree = await harness.render(CraftPlanManagerDialog, props);
    const refreshButton = findElements(tree, (element) => element.type === "button" && elementText(element).trim() === "Refresh")[0];
    refreshButton.props.onClick();
    assert.equal(managerLoads, 1, "dirty Refresh must not reload immediately");

    tree = await harness.render(CraftPlanManagerDialog, props);
    const confirmation = findElements(tree, (element) => element.props?.role === "group" && element.props?.["aria-labelledby"] === "craft-plan-refresh-confirmation-title")[0];
    assert.ok(confirmation, "dirty Refresh should expose an accessible confirmation");
    const cancelButton = findElements(confirmation, (element) => element.type === "button" && elementText(element).trim() === "Keep editing")[0];
    cancelButton.props.onClick();
    tree = await harness.render(CraftPlanManagerDialog, props);
    assert.equal(findElements(tree, (element) => element.props?.role === "group" && element.props?.["aria-labelledby"] === "craft-plan-refresh-confirmation-title").length, 0);
    assert.equal(managerLoads, 1);
    assert.ok(findElements(tree, (element) => element.type === "input" && element.props.value === "Unsaved plan")[0], "cancelling Refresh must preserve the draft");

    findElements(tree, (element) => element.type === "button" && elementText(element).trim() === "Refresh")[0].props.onClick();
    tree = await harness.render(CraftPlanManagerDialog, props);
    const discardButton = findElements(tree, (element) => element.type === "button" && elementText(element).trim() === "Discard and refresh")[0];
    discardButton.props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(managerLoads, 2, "confirmed Refresh should reload saved state");
  } finally {
    globalThis.fetch = originalFetch;
    harness.restore();
    await vite.close();
  }
});

test("closing clears the manager draft before a failed reopen load", async () => {
  const appRoot = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  const refreshContext = { current: { cycle: null, trackPromise: (_key, promise) => promise } };
  const harness = installHookHarness(refreshContext);
  const originalFetch = globalThis.fetch;
  let managerLoads = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/api/local/admin/craft-plan")) managerLoads += 1;
    if (managerLoads === 2) return { ok: false, status: 502, json: async () => ({ error: "Relay unavailable" }) };
    return { ok: true, json: async () => ({ config: { name: "Saved plan", targets: [], sourceRules: {} }, sources: {} }) };
  };
  try {
    const { CraftPlanManagerDialog } = await vite.ssrLoadModule("/src/pages/CraftPlanManagerDialog.tsx");
    const baseProps = { onClose() {}, csrfToken: "csrf", onSaved() {} };
    await harness.render(CraftPlanManagerDialog, { ...baseProps, open: true });
    let tree = await harness.render(CraftPlanManagerDialog, { ...baseProps, open: true });
    const nameInput = findElements(tree, (element) => element.type === "input" && element.props.value === "Saved plan")[0];
    nameInput.props.onChange({ target: { value: "Unsaved plan" } });

    await harness.render(CraftPlanManagerDialog, { ...baseProps, open: false });
    await harness.render(CraftPlanManagerDialog, { ...baseProps, open: true });
    tree = await harness.render(CraftPlanManagerDialog, { ...baseProps, open: true });

    assert.equal(managerLoads, 2);
    assert.equal(findElements(tree, (element) => element.type === "input" && element.props.value === "Unsaved plan").length, 0, "a failed reopen must not restore the closed draft");
    assert.ok(findElements(tree, (element) => element.type === "input" && element.props.value === "")[0], "the reopened session should start from an empty draft until a load succeeds");
  } finally {
    globalThis.fetch = originalFetch;
    harness.restore();
    await vite.close();
  }
});
