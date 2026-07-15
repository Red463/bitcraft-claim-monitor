import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const App = React.lazy(() => import("./AppShell"));

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

// Keep this file as the React bootstrapping boundary only. App-level routing,
// settings, auth, and data coordination live in AppShell so future maintainers
// do not have to trace startup behaviour through multiple entrypoints.
createRoot(document.getElementById("root")!).render(
  <RouteErrorBoundary>
    <React.Suspense fallback={<main className="route-entry-state"><section className="empty-state panel" aria-live="polite">Loading page...</section></main>}>
      <App />
    </React.Suspense>
  </RouteErrorBoundary>,
);
