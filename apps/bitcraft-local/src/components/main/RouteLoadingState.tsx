type Props = { label?: string };

export function RouteLoadingState({ label = "page" }: Props) {
  const displayLabel = String(label || "page").trim() || "page";
  return (
    <section className="route-loading-state" role="status" aria-live="polite" aria-busy="true">
      <p className="route-loading-label">Loading {displayLabel}...</p>
      <span className="route-loading-shape route-loading-title" aria-hidden="true" />
      <div className="route-loading-summary" aria-hidden="true">
        {[0, 1, 2].map((id) => <span className="route-loading-shape" key={id} />)}
      </div>
      <div className="route-loading-content" aria-hidden="true">
        <span className="route-loading-shape" />
        <span className="route-loading-shape" />
        <span className="route-loading-shape" />
      </div>
    </section>
  );
}
