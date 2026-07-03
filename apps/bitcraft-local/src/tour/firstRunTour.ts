import type { ActivePanel } from "../types/app";

export const FIRST_RUN_TOUR_SEEN_KEY = "onboarding.firstTourSeen";

export type FirstRunTourAction = "decline" | "start" | "skip" | "close" | "complete";
export type TourPlacement = "center" | "top" | "right" | "bottom" | "left";

export type FirstRunTourStep = {
  id: string;
  page: ActivePanel;
  target: string;
  title: string;
  body: string;
  placement: TourPlacement;
  action?: "settings";
};

export const FIRST_RUN_TOUR_STEPS: FirstRunTourStep[] = [
  {
    id: "navigation",
    page: "dashboard",
    target: "sidebar-navigation",
    title: "Move around the app",
    body: "Use the sidebar to jump between settlement operations, market tools, the world map, activity history, and utility tools.",
    placement: "right",
  },
  {
    id: "dashboard",
    page: "dashboard",
    target: "dashboard-summary",
    title: "Start with the dashboard",
    body: "The dashboard gives you the fastest read on settlement status, recent activity, production, and market signals.",
    placement: "bottom",
  },
  {
    id: "refresh",
    page: "dashboard",
    target: "floating-actions",
    title: "Refresh, settings, and notifications",
    body: "These floating tools let you refresh data, change browser settings, review notifications, and open help from any page.",
    placement: "center",
  },
  {
    id: "leaderboard",
    page: "leaderboard",
    target: "leaderboard-page",
    title: "Compare member activity",
    body: "Leaderboard ranks contributions, professions, activity, market signals, and online sessions for settlement members.",
    placement: "bottom",
  },
  {
    id: "members",
    page: "members",
    target: "members-page",
    title: "Inspect settlement members",
    body: "Members shows roster details, online state, equipment, passive crafts, and player-specific drilldowns.",
    placement: "bottom",
  },
  {
    id: "skills",
    page: "skills",
    target: "skills-page",
    title: "Review profession coverage",
    body: "Professions highlights settlement strengths, gaps, and member skill levels across crafting, gathering, and adventure skills.",
    placement: "bottom",
  },
  {
    id: "production",
    page: "production",
    target: "production-controls",
    title: "Track active production",
    body: "Production shows active and queued crafts, contributors, private crafts, sorting, and member filters.",
    placement: "bottom",
  },
  {
    id: "inventory",
    page: "inventory",
    target: "inventory-page",
    title: "Find stored items",
    body: "Inventory helps you search storage, review stock, and drill into item locations across settlement containers.",
    placement: "bottom",
  },
  {
    id: "construction",
    page: "construction",
    target: "construction-page",
    title: "Watch construction needs",
    body: "Construction shows active projects, missing materials, and completion progress so gathering work is easier to target.",
    placement: "bottom",
  },
  {
    id: "research",
    page: "research",
    target: "research-page",
    title: "Compare research status",
    body: "Research shows what is already researched and what is still available to unlock.",
    placement: "bottom",
  },
  {
    id: "market",
    page: "market",
    target: "market-tools",
    title: "Review market tools",
    body: "Market tools cover live listings, analytics, price lookup, buy orders, and your deal watchlist.",
    placement: "bottom",
  },
  {
    id: "region",
    page: "empire",
    target: "region-page",
    title: "Compare regional claims",
    body: "Region rankings compare visible settlements by tier-heavy score, treasury, tiles, supplies, and nearby claims.",
    placement: "bottom",
  },
  {
    id: "empires",
    page: "empires",
    target: "empires-page",
    title: "Watch empires and towers",
    body: "Empires helps you inspect watchtowers, at-risk towers, aligned claims, and recent member activity.",
    placement: "top",
  },
  {
    id: "map",
    page: "map",
    target: "map-player-tracking",
    title: "Use the world map",
    body: "The map can track online settlement members and selected resources without flooding the page with every player.",
    placement: "bottom",
  },
  {
    id: "activity",
    page: "activity",
    target: "activity-controls",
    title: "Audit activity history",
    body: "Activity history collects the important changes and notification events so you can review what happened later.",
    placement: "bottom",
  },
  {
    id: "publiccrafts",
    page: "publiccrafts",
    target: "publiccrafts-page",
    title: "Find public craft XP",
    body: "Public Craft Finder helps locate public jobs by skill, region, XP, settlement, and remaining effort.",
    placement: "bottom",
  },
  {
    id: "craftcalc",
    page: "craftcalc",
    target: "craftcalc-page",
    title: "Plan recipe chains",
    body: "Craft Calculator expands recipes into material requirements so you can plan production before gathering.",
    placement: "bottom",
  },
  {
    id: "sync",
    page: "sync",
    target: "sync-page",
    title: "Use Sync when needed",
    body: "Sync opens the BitCraft sync helper for data collection workflows that need the external page.",
    placement: "bottom",
  },
  {
    id: "user-settings",
    page: "dashboard",
    target: "user-settings",
    title: "Tune your browser settings",
    body: "User settings control density, notification sounds, theme accents, account links, and local browser preferences.",
    placement: "center",
    action: "settings",
  },
];

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

