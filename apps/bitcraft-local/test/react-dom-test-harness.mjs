import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const DOM_GLOBALS = [
  "window",
  "document",
  "navigator",
  "Node",
  "Element",
  "HTMLElement",
  "Event",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
  "AbortController",
  "requestAnimationFrame",
  "cancelAnimationFrame",
];

export function installDom(url = "http://localhost/") {
  const previous = new Map(DOM_GLOBALS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const window = new Window({ url });
  const values = {
    window,
    document: window.document,
    navigator: window.navigator,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    Event: window.Event,
    FocusEvent: window.FocusEvent,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
    AbortController: window.AbortController,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  };
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  return {
    window,
    async flush() {
      await act(async () => {
        await window.happyDOM.whenAsyncComplete();
        await Promise.resolve();
      });
    },
    restore() {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      window.close();
    },
  };
}

export async function mount(element) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    container,
    async render(nextElement) {
      await act(async () => root.render(nextElement));
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

export { React, act };
