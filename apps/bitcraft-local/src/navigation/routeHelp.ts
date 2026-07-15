import type { ActivePanel } from "../types/app";

export type RouteHelp = { purpose: string; nextAction: string };
type PublicPanel = Exclude<ActivePanel, "admin">;

export const ROUTE_HELP = {
  dashboard: { purpose: "Scan current settlement attention signals and data freshness.", nextAction: "Open the operational area that needs action first." },
  leaderboard: { purpose: "Compare member contribution and settlement standings.", nextAction: "Select a ranking to identify leaders and gaps." },
  members: { purpose: "Review member activity, roles, and progression.", nextAction: "Open a member to inspect their current details." },
  skills: { purpose: "Compare settlement profession and skill coverage.", nextAction: "Choose a skill to find capable members and coverage gaps." },
  production: { purpose: "Find production opportunities and available crafters.", nextAction: "Filter the work list, then open a recipe or member assignment." },
  planning: { purpose: "Turn settlement goals into tracked material and production needs.", nextAction: "Review the Needs Board, then open a material to see where to get it." },
  publiccrafts: { purpose: "Find public crafting stations and recipes outside the settlement.", nextAction: "Search for the craft you need and compare available locations." },
  craftcalc: { purpose: "Calculate recipe chains and their total material costs.", nextAction: "Choose a recipe and quantity to expand its requirements." },
  inventory: { purpose: "Inspect settlement storage and item availability.", nextAction: "Search for an item to find its current stacks and locations." },
  construction: { purpose: "Track active construction projects and missing supplies.", nextAction: "Open a project to review its remaining requirements." },
  research: { purpose: "Review research progress and outstanding contribution needs.", nextAction: "Select a research task to inspect its remaining materials." },
  market: { purpose: "Compare listings, pricing history, and watched market opportunities.", nextAction: "Choose a market tool, then search for an item or order." },
  empire: { purpose: "Inspect the selected region and its settlement context.", nextAction: "Review the regional summary, then open a related settlement or map location." },
  empires: { purpose: "Compare empire-wide settlement and regional activity.", nextAction: "Select an empire or region to inspect its current details." },
  map: { purpose: "Locate settlements, players, resources, and tracked activity.", nextAction: "Choose a map layer or search target to focus the view." },
  sync: { purpose: "Check data freshness and refresh supported local datasets.", nextAction: "Review sync status, then refresh any stale source you need." },
  activity: { purpose: "Review recent settlement events and operational changes.", nextAction: "Filter the timeline to investigate the activity that matters." },
} satisfies Record<PublicPanel, RouteHelp>;

export function routeHelpFor(panel: ActivePanel): RouteHelp | null {
  return panel === "admin" ? null : ROUTE_HELP[panel];
}
