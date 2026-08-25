export type PublicRouteId = "overview" | "settlement" | "plans" | "plan-new" | "plan" | "shared-plan" | "invite" | "not-found";

export type PublicRoute = {
  id: PublicRouteId;
  params: Record<string, string>;
};

export function resolvePublicRoute(pathname: string): PublicRoute;
export function publicStorageKey(suffix: string): string;
