import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createServer as createViteServer } from "vite";
import { React, installDom, mount } from "./react-dom-test-harness.mjs";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const disabledFeatures = {
  publicProfileEnabled: false,
  publicCollaborationEnabled: false,
  publicLegalConfigurationConfirmed: false,
};

test("disabled public profile renders maintenance without an operable settlement search", async () => {
  const dom = installDom("http://localhost/");
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  let view;
  try {
    const { PublicAppShell } = await vite.ssrLoadModule("/src/public/PublicAppShell.tsx");
    view = await mount(React.createElement(PublicAppShell, {
      route: { id: "home", params: {} },
      features: disabledFeatures,
    }));
    assert.match(document.body.textContent, /not enabled yet/i);
    assert.equal(document.querySelector("#public-settlement-search"), null);
    assert.doesNotMatch(document.body.textContent, /Not found|being prepared/i);
  } finally {
    if (view) await view.unmount();
    await vite.close();
    dom.restore();
  }
});

test("public shell fails closed when a caller omits server-owned feature flags", async () => {
  const dom = installDom("http://localhost/");
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  let view;
  try {
    const { PublicAppShell } = await vite.ssrLoadModule("/src/public/PublicAppShell.tsx");
    view = await mount(React.createElement(PublicAppShell, { route: { id: "home", params: {} } }));
    assert.match(document.body.textContent, /not enabled yet/i);
    assert.equal(document.querySelector("#public-settlement-search"), null);
  } finally {
    if (view) await view.unmount();
    await vite.close();
    dom.restore();
  }
});

test("enabled read-only profile presents settlement search without unfinished placeholder copy", async () => {
  const dom = installDom("http://localhost/");
  const vite = await createViteServer({ root: appRoot, appType: "custom", logLevel: "silent", server: { middlewareMode: true } });
  let view;
  try {
    const { PublicAppShell } = await vite.ssrLoadModule("/src/public/PublicAppShell.tsx");
    view = await mount(React.createElement(PublicAppShell, {
      route: { id: "home", params: {} },
      features: { ...disabledFeatures, publicProfileEnabled: true, publicLegalConfigurationConfirmed: true },
    }));
    assert.ok(document.querySelector("#public-settlement-search"));
    assert.match(document.body.textContent, /Search for a settlement/i);
    assert.doesNotMatch(document.body.textContent, /being prepared/i);
  } finally {
    if (view) await view.unmount();
    await vite.close();
    dom.restore();
  }
});
