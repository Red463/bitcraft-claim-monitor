import React from "react";
import { PublicAppShell } from "./PublicAppShell";
import { resolvePublicRoute } from "./routes.mjs";

export default function PublicRoot() {
  const [route, setRoute] = React.useState(() => resolvePublicRoute(window.location.pathname));
  React.useEffect(() => {
    const update = () => setRoute(resolvePublicRoute(window.location.pathname));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  if (route.id === "not-found") {
    return <main className="public-not-found" data-public-route="not-found"><h1>Page not found</h1><p>This public claim-monitor page is not available.</p><a className="toolbar-button primary" href="/">Open claim monitor</a></main>;
  }
  return <PublicAppShell route={route} />;
}
