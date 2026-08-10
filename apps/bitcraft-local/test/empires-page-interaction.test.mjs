import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import React from "react";
import { createServer as createViteServer } from "vite";

const SIEGE_OUTCOMES_KEY = "bitcraft:empires:recent-siege-outcomes-expanded";

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

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
}

function installHookHarness(watchtowerData) {
  const originals = {
    useContext: React.useContext,
    useEffect: React.useEffect,
    useMemo: React.useMemo,
    useState: React.useState,
  };
  let state = [];
  let cursor = 0;
  let effects = [];

  React.useContext = () => ({ cycle: null, request: null, trackPromise: (_key, promise) => promise });
  React.useMemo = (calculate) => calculate();
  React.useEffect = (effect, dependencies) => {
    if (dependencies?.length === 1 && typeof dependencies[0] === "boolean") effects.push(effect);
  };
  React.useState = (initial) => {
    const index = cursor++;
    if (!(index in state)) {
      const initialValue = typeof initial === "function" ? initial() : initial;
      state[index] = initialValue?.data === null && initialValue?.loading === false && initialValue?.error === null
        ? { data: watchtowerData, loading: false, error: null }
        : initialValue;
    }
    return [state[index], (update) => {
      state[index] = typeof update === "function" ? update(state[index]) : update;
    }];
  };

  return {
    render(Component, props) {
      cursor = 0;
      effects = [];
      const tree = Component(props);
      for (const effect of effects) effect();
      return tree;
    },
    unmount() {
      state = [];
    },
    restore() {
      React.useContext = originals.useContext;
      React.useEffect = originals.useEffect;
      React.useMemo = originals.useMemo;
      React.useState = originals.useState;
    },
  };
}

test("Recent Siege Outcomes expands accessibly and restores its persisted state after remount", async () => {
  const storage = memoryStorage({ "claim-monitor.empires.tab": JSON.stringify("watchtowers") });
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  const appRoot = fileURLToPath(new URL("..", import.meta.url));
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  const harness = installHookHarness({
    towers: [],
    empires: [],
    summary: {},
    unmatchedTerminalStatus: "removed_or_unknown",
    recentSiegeOutcomes: [{
      eventKey: "siege-1",
      outcome: "attacker_won",
      watchtowerLabel: "Oakwatch",
      attackerEmpireName: "Northstar",
      defenderEmpireName: "Timbersteel",
      occurredAt: "2026-08-10T10:00:00.000Z",
    }],
  });
  try {
    const { Empires } = await vite.ssrLoadModule("/src/pages/EmpiresPage.tsx");
    const props = {
      monitoredRegionId: "19",
      monitoredClaimId: "55",
      providerData: null,
      providerLoading: false,
      providerError: null,
    };

    let tree = harness.render(Empires, props);
    let toggle = findElements(tree, (element) => element.type === "button" && element.props["aria-controls"] === "recent-siege-outcomes-content")[0];
    assert.ok(toggle, "accessible siege outcome toggle should render");
    assert.equal(toggle.props["aria-expanded"], false);
    assert.equal(findElements(tree, (element) => element.props?.className === "siege-outcome-list").length, 0);

    toggle.props.onClick();
    tree = harness.render(Empires, props);
    toggle = findElements(tree, (element) => element.type === "button" && element.props["aria-controls"] === "recent-siege-outcomes-content")[0];
    assert.equal(toggle.props["aria-expanded"], true);
    assert.equal(findElements(tree, (element) => element.props?.className === "siege-outcome-list").length, 1);
    assert.match(elementText(tree), /Oakwatch/);
    assert.equal(storage.getItem(SIEGE_OUTCOMES_KEY), "true");

    harness.unmount();
    tree = harness.render(Empires, props);
    toggle = findElements(tree, (element) => element.type === "button" && element.props["aria-controls"] === "recent-siege-outcomes-content")[0];
    assert.equal(toggle.props["aria-expanded"], true);
    assert.match(elementText(tree), /Oakwatch/);
  } finally {
    harness.restore();
    await vite.close();
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});
