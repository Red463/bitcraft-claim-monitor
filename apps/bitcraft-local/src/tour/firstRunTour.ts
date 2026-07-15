import type { ActivePanel } from "../types/app";

export const FIRST_RUN_TOUR_SEEN_KEY = "onboarding.firstTourSeen";

export type FirstRunTourAction = "decline" | "start" | "skip" | "close" | "complete";
export type FirstRunTourState = { mode: "idle" | "prompt" | "running" };
export type FirstRunTourTransitionAction = { type: FirstRunTourAction | "prompt" | "replay" };
export type TourPlacement = "center" | "top" | "right" | "bottom" | "left";

export type FirstRunTourStep = {
  id: string;
  page: ActivePanel;
  target: string;
  title: string;
  body: string;
  placement: TourPlacement;
};

export const FIRST_RUN_TOUR_STEPS: FirstRunTourStep[] = [
  {
    id: "purpose-freshness",
    page: "dashboard",
    target: "floating-actions",
    title: "One live settlement view",
    body: "Claim Monitor brings settlement work together using live BitJita data. Check the freshness status before relying on time-sensitive information, and refresh when you need the latest available view.",
    placement: "center",
  },
  {
    id: "dashboard-attention",
    page: "dashboard",
    target: "dashboard-summary",
    title: "Start with what needs attention",
    body: "The Dashboard is your first-success path: scan settlement status, recent activity, production, and market signals, then open the task that needs attention.",
    placement: "bottom",
  },
  {
    id: "navigation-groups",
    page: "dashboard",
    target: "sidebar-navigation",
    title: "Choose a job, not a route tour",
    body: "Navigation is grouped around settlement operations, crafting, markets, world activity, and utility tools. Detailed guidance stays with the page where it is useful.",
    placement: "right",
  },
  {
    id: "search-jump",
    page: "dashboard",
    target: "floating-actions",
    title: "Jump straight to a task",
    body: "Press Ctrl or Command + K, or press / when you are not typing, to search and jump. Try Craft Planning when you need to turn a settlement goal into material and production work.",
    placement: "center",
  },
  {
    id: "account-access",
    page: "dashboard",
    target: "floating-actions",
    title: "Sign in only when it helps",
    body: "Discord sign-in can synchronize supported preferences and identify your linked character. Some routes may require a signed-in or verified character, but signing in or verification does not guarantee access.",
    placement: "center",
  },
  {
    id: "help-replay",
    page: "dashboard",
    target: "floating-actions",
    title: "Help stays close to the work",
    body: "Open Help from any page for application guidance and context. You can replay this short tour there whenever you want a refresher.",
    placement: "center",
  },
];

export function effectiveTourSteps(showAccountStep: boolean) {
  return FIRST_RUN_TOUR_STEPS.filter((step) => showAccountStep || step.id !== "account-access");
}

export function firstRunTourTransition(_state: FirstRunTourState, action: FirstRunTourTransitionAction): FirstRunTourState {
  if (action.type === "prompt") return { mode: "prompt" };
  if (action.type === "start" || action.type === "replay") return { mode: "running" };
  return { mode: "idle" };
}

export function reportedTourVisibility(enabled: boolean, state: FirstRunTourState) {
  return enabled && state.mode !== "idle";
}

export function shouldHandleTourReplay(enabled: boolean, replayToken: number, handledReplayToken: number) {
  return enabled && replayToken > handledReplayToken;
}

export function shouldShowFirstRunTourPrompt({ seen, blocked, active = false }: { seen: boolean; blocked: boolean; active?: boolean }) {
  return !seen && !blocked && !active;
}

export function firstRunTourSeenAfterAction(action: FirstRunTourAction) {
  return ["decline", "start", "skip", "close", "complete"].includes(action);
}

export function tourTargetSelector(step: Pick<FirstRunTourStep, "target">) {
  return `[data-tour="${step.target.replace(/"/g, '\\"')}"]`;
}

export type TourDocumentLike = {
  querySelector: (selector: string) => { getBoundingClientRect?: () => DOMRect | { left: number; top: number; width: number; height: number; right?: number; bottom?: number } } | null;
};

export function tourTargetRect(documentLike: TourDocumentLike | undefined, step: FirstRunTourStep) {
  const target = documentLike?.querySelector(tourTargetSelector(step));
  const rect = target?.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right ?? rect.left + rect.width,
    bottom: rect.bottom ?? rect.top + rect.height,
  };
}
