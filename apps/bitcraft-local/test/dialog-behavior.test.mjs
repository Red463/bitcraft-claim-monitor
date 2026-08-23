import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createServer as createViteServer } from "vite";

import { React, act, installDom, mount } from "./react-dom-test-harness.mjs";

const appRoot = fileURLToPath(new URL("..", import.meta.url));

function key(window, value, options = {}) {
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options }));
}

function trackingStorage() {
  const values = new Map();
  const writes = [];
  return {
    writes,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { writes.push([key, String(value)]); values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; },
  };
}

test("shared Dialog focuses and traps, labels visibly, closes dismissible messages, and restores the page", async () => {
  const dom = installDom();
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { Dialog } = await vite.ssrLoadModule("/src/components/main/Dialog.tsx");
    const opener = document.createElement("button");
    opener.textContent = "Open";
    document.body.append(opener);
    document.body.style.overflow = "auto";
    opener.focus();
    let closeCount = 0;

    function Harness() {
      const [open, setOpen] = React.useState(true);
      return React.createElement(Dialog, {
        open,
        title: "Operational notice",
        titleElementId: "operational-title",
        onClose() { closeCount += 1; setOpen(false); },
      },
      React.createElement("h2", { id: "operational-title" }, "Operational notice"),
      React.createElement("button", null, "First"),
      React.createElement("button", null, "Last"));
    }

    const view = await mount(React.createElement(Harness));
    await dom.flush();
    const dialog = document.querySelector('[role="dialog"]');
    const buttons = [...dialog.querySelectorAll("button")];
    assert.equal(dialog.getAttribute("aria-labelledby"), "operational-title");
    assert.equal(document.getElementById("operational-title").textContent, "Operational notice");
    assert.equal(document.activeElement, buttons[0]);
    assert.equal(document.body.style.overflow, "hidden");

    buttons[1].focus();
    key(dom.window, "Tab");
    assert.equal(document.activeElement, buttons[0], "Tab wraps from the last control");
    key(dom.window, "Tab", { shiftKey: true });
    assert.equal(document.activeElement, buttons[1], "Shift+Tab wraps from the first control");
    opener.focus();
    assert.equal(document.activeElement, buttons[0], "focus cannot escape a modal dialog");

    await act(async () => key(dom.window, "Escape"));
    assert.equal(closeCount, 1);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(document.activeElement, opener);
    assert.equal(document.body.style.overflow, "auto");
    await view.unmount();
  } finally {
    await vite.close();
    dom.restore();
  }
});

test("AppPopupManager persists one dismissal and requires explicit acknowledgement for danger messages", async () => {
  const dom = installDom();
  const persistent = trackingStorage();
  const session = trackingStorage();
  Object.defineProperty(dom.window, "localStorage", { configurable: true, value: persistent });
  Object.defineProperty(dom.window, "sessionStorage", { configurable: true, value: session });
  const originalFetch = globalThis.fetch;
  let popupType = "info";
  globalThis.fetch = async () => new Response(JSON.stringify({ popups: [{
    id: `notice-${popupType}`,
    title: popupType === "danger" ? "Service interruption" : "Maintenance complete",
    message: "Operational message",
    type: popupType,
    mode: "oneTime",
    page: "any",
    enabled: true,
    updatedAt: "v1",
  }] }), { status: 200 });
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  try {
    const { AppPopupManager } = await vite.ssrLoadModule("/src/components/main/AppPopupManager.tsx");
    let view = await mount(React.createElement(AppPopupManager));
    await dom.flush();
    assert.equal(document.querySelector("h2")?.textContent, "Maintenance complete");
    await act(async () => {
      key(dom.window, "Escape");
      key(dom.window, "Escape");
    });
    assert.equal(document.querySelector('[role="dialog"]'), null);
    assert.equal(persistent.writes.length, 1, "a repeated close signal writes one persistent dismissal");
    assert.equal(session.writes.length, 1, "a repeated close signal writes session state once");
    await view.unmount();

    persistent.clear();
    persistent.writes.length = 0;
    session.clear();
    session.writes.length = 0;
    popupType = "danger";
    view = await mount(React.createElement(AppPopupManager));
    await dom.flush();
    await act(async () => key(dom.window, "Escape"));
    assert.equal(document.querySelector("h2")?.textContent, "Service interruption");
    assert.equal(persistent.writes.length, 0, "danger notices are not silently dismissed with Escape");
    await act(async () => document.querySelector(".app-popup-actions .primary").click());
    assert.equal(persistent.writes.length, 1);
    assert.equal(document.querySelector('[role="dialog"]'), null);
    await view.unmount();
  } finally {
    globalThis.fetch = originalFetch;
    await vite.close();
    dom.restore();
  }
});
