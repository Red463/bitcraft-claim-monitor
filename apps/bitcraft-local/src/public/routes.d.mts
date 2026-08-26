export type PublicRouteId =
  | "overview"
  | "settlement"
  | "members"
  | "inventory"
  | "crafts"
  | "calculator"
  | "account"
  | "settings"
  | "help"
  | "terms"
  | "privacy"
  | "plans"
  | "plan-new"
  | "plan"
  | "shared-plan"
  | "invite"
  | "not-found";

export type PublicRoute = {
  id: PublicRouteId;
  params: Record<string, string>;
};

export function resolvePublicRoute(pathname: string): PublicRoute;
export function publicSettlementPath(hint: { claimId?: unknown } | null | undefined): string | null;
export function publicStorageKey(suffix: string): string;
