import React from "react";
import { createRoot } from "react-dom/client";
import { loadHostProfile, rootForProfile, type FrontendProfile } from "./api/profile";
import { RouteLoadingState } from "./components/main/RouteLoadingState";
import "./styles.css";

const TimbersteelRoot = React.lazy(() => import("./TimbersteelRoot"));
const PublicRoot = React.lazy(() => import("./public/PublicRoot"));

function EntryLoadingState() {
  return <main className="route-entry-state"><RouteLoadingState /></main>;
}

class RouteErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="route-entry-state">
        <section className="empty-state panel" role="alert">
          <strong>This page could not be loaded.</strong>
          <span>Check your connection, then try again.</span>
          <button className="toolbar-button primary" onClick={() => window.location.reload()}>Try again</button>
        </section>
      </main>
    );
  }
}

function Root() {
  const [profile, setProfile] = React.useState<FrontendProfile | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const controller = new AbortController();
    loadHostProfile(fetch, controller.signal)
      .then((nextProfile) => {
        if (!controller.signal.aborted) setProfile(nextProfile);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load the application profile.");
      });
    return () => controller.abort();
  }, []);

  if (error) return <main className="route-entry-state" role="alert">{error}</main>;
  if (!profile) return <EntryLoadingState />;

  // The server validates the host for every request. This response only picks
  // an isolated frontend entrypoint; it never grants client-side authority.
  const entry = rootForProfile(profile) === "public" ? <PublicRoot /> : <TimbersteelRoot />;
  return <RouteErrorBoundary><React.Suspense fallback={<EntryLoadingState />}>{entry}</React.Suspense></RouteErrorBoundary>;
}

createRoot(document.getElementById("root")!).render(<Root />);
