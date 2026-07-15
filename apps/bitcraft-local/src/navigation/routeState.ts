import type { ActivePanel } from "../types/app";

export type PageId = ActivePanel;
export type NavigationMode = "push" | "replace";

function locationHref(): string {
  const url = new URL(window.location.href);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function writeQueryLocation(values: Record<string, string | null>, mode: NavigationMode): void {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  const nextHref = `${url.pathname}${url.search}${url.hash}`;
  if (nextHref === locationHref()) return;
  window.history[mode === "push" ? "pushState" : "replaceState"](null, "", nextHref);
}

export function writePageLocation(page: PageId, mode: NavigationMode): void {
  writeQueryLocation({ page }, mode);
}

export function resolveAllowedView<T extends string>(requested: T, allowed: readonly T[]): T | null {
  if (!allowed.length) return null;
  return allowed.includes(requested) ? requested : allowed[0];
}
