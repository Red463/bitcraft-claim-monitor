import type { DomainKey } from "../server/game-data/contracts.ts";
import type { ActivePanel } from "../types/app.ts";

export function pageDomains(activePanel: ActivePanel): DomainKey[] {
  switch (activePanel) {
    case "dashboard":
      return ["claim", "members", "citizens", "players"];
    case "members":
      return ["claim", "members", "citizens", "players"];
    case "skills":
    case "leaderboard":
      return ["claim", "members", "citizens", "players", "skills"];
    case "craft-monitor":
      return ["claim", "members", "citizens", "players", "crafts", "contributions"];
    case "inventory":
      return ["claim", "members", "inventories"];
    case "construction":
      return ["claim", "members", "inventories", "construction"];
    case "research":
      return ["claim", "members", "research"];
    case "settlement-market":
      return ["claim", "members", "market"];
    case "map":
      return ["claim", "members", "players", "layout"];
    case "region":
      return ["claim", "members", "players", "region"];
    case "empires":
      return ["claim", "members", "empires", "deposits"];
    case "market":
      return ["market", "catalogs"];
    default:
      return [];
  }
}
