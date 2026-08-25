import React from "react";
import { resolvePublicRoute } from "./routes.mjs";

const routeLabels: Record<string, string> = {
  overview: "Claim Monitor",
  settlement: "Settlement",
  plans: "Plans",
  "plan-new": "New plan",
  plan: "Plan",
  "shared-plan": "Shared plan",
  invite: "Invite",
};

export default function PublicRoot() {
  const route = resolvePublicRoute(window.location.pathname);
  if (route.id === "not-found") {
    return <main className="route-entry-state" data-public-route="not-found"><h1>Page not found</h1></main>;
  }
  return <main className="route-entry-state" data-public-route={route.id}><h1>{routeLabels[route.id]}</h1></main>;
}
