import {
  Activity,
  Calculator,
  CircleDollarSign,
  Factory,
  ClipboardList,
  FlaskConical,
  Globe2,
  GraduationCap,
  Hammer,
  Home,
  KeyRound,
  Landmark,
  Map as MapIcon,
  Package,
  Search,
  Share2,
  Trophy,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ActivePanel } from "./types/app";

/*
 * Main app navigation model.
 *
 * The sidebar, command palette, URL validation, and default-page handling derive
 * from these groups. Keep href generation intact so middle-click and
 * open-in-new-tab continue to work like normal links.
 */

export type NavItem = readonly [ActivePanel, string, LucideIcon];
export type NavGroup = { id: string; label: string; items: readonly NavItem[] };

export const NAV_GROUPS = [
  { id: "command", label: "Overview", items: [
    ["dashboard", "Dashboard", Home],
    ["leaderboard", "Leaderboard", Trophy],
  ] },
  { id: "settlement", label: "Settlement", items: [
    ["members", "Members", Users],
    ["skills", "Professions", GraduationCap],
    ["production", "Production", Factory],
    ["planning", "Craft Planning", ClipboardList],
    ["inventory", "Inventory", Package],
    ["construction", "Construction", Hammer],
    ["research", "Research", FlaskConical],
  ] },
  { id: "economy", label: "Economy & Region", items: [
    ["market", "Market", CircleDollarSign],
    ["empire", "Region", Globe2],
    ["empires", "Empires", Landmark],
    ["map", "Map", MapIcon],
    ["activity", "Activity", Activity],
  ] },
  { id: "tools", label: "Tools", items: [
    ["publiccrafts", "Public Craft Finder", Search],
    ["craftcalc", "Craft Calculator", Calculator],
    ["sync", "Sync", Share2],
  ] },
] as const satisfies readonly NavGroup[];

export const ADMIN_NAV_ITEM = ["admin", "Admin", KeyRound] as const satisfies NavItem;

export const NAV: readonly NavItem[] = NAV_GROUPS.reduce<NavItem[]>((items, group) => {
  items.push(...group.items);
  return items;
}, [ADMIN_NAV_ITEM]);

export const DEFAULT_SIDEBAR_GROUPS = Object.fromEntries(NAV_GROUPS.map((group) => [group.id, true])) as Record<string, boolean>;

export function urlPanel(): ActivePanel | null {
  const panel = new URLSearchParams(window.location.search).get("page");
  // Legacy routes from earlier releases should land on the replacement dashboard
  // instead of leaving users on a removed page.
  if (panel === "buildings" || panel === "overview") return "dashboard";
  return NAV.some(([id]) => id === panel) ? panel as ActivePanel : null;
}

export function updateQueryState(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function panelHref(panel: ActivePanel): string {
  return `/?page=${encodeURIComponent(panel)}`;
}
