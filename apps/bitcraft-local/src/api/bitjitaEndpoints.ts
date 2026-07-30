import type { ActivePanel } from "../types/app.ts";
import { usesProviderNeutralGameData } from "./pageDomains.ts";

export function marketEndpointMap(claimId: string, activePanel?: ActivePanel): Record<string, string> {
  if (activePanel && usesProviderNeutralGameData(activePanel)) return {};
  const endpoints = {
    claim: `/claims/${claimId}`,
    members: `/claims/${claimId}/members`,
    citizens: `/claims/${claimId}/citizens`,
    buildings: `/claims/${claimId}/buildings`,
    inventories: `/claims/${claimId}/inventories`,
    research: `/claims/${claimId}/research`,
    recruitment: `/claims/${claimId}/recruitment`,
    market: `/claims/${claimId}/market/listings?limit=200`,
    crafts: `/crafts?claimEntityId=${claimId}&completed=false`,
    layout: `/claims/${claimId}/layout`,
    skills: "/skills",
  } as const;
  if (!activePanel) return endpoints;
  if (activePanel === "activity" || activePanel === "admin" || activePanel === "planning") return {};

  const keys = new Set<keyof typeof endpoints>(["claim", "members"]);
  const add = (...nextKeys: Array<keyof typeof endpoints>) => nextKeys.forEach((key) => keys.add(key));

  switch (activePanel) {
    case "dashboard":
      add("citizens", "buildings", "research", "market");
      break;
    case "members":
      add("citizens");
      break;
    case "skills":
      add("citizens", "skills");
      break;
    case "craft-monitor":
      add("citizens", "crafts");
      break;
    case "leaderboard":
      add("citizens", "skills");
      break;
    case "inventory":
      add("inventories");
      break;
    case "research":
      add("research");
      break;
    case "settlement-market":
      add("market");
      break;
    case "market":
    case "empires":
      break;
    default:
      break;
  }

  return Object.fromEntries([...keys].map((key) => [key, endpoints[key]]));
}
