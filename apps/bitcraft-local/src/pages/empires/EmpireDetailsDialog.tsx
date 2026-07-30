import React from "react";
import { ArrowLeft, Castle, Clock, Crown, Hammer, Landmark, MapPin, Package, RadioTower, Users, X, Zap } from "lucide-react";
import { AppSkeleton } from "../../components/main/AppChrome";
import { AsyncState } from "../../components/main/AsyncState";
import { Dialog } from "../../components/main/Dialog";
import type { AnyRecord } from "../../main-app-data";
import { dateLabel, formatCompactNumber, formatGoldAmount, formatNumber, timeAgo } from "../../utils/format";
import { presentHexiteReserveMetric } from "./hexitePresentation";
import { coordinateText } from "./watchtowerPresentation";
import { useManualRefresh } from "../../refresh/ManualRefreshContext";
import { manualRefreshHeaders } from "../../refresh/manualRefresh.mjs";

type EmpireDetailsState = {
  data: AnyRecord | null;
  loading: boolean;
  error: string | null;
};

type EmpireDetailsTab = "overview" | "members" | "claims" | "towers";

type EmpireDetailsDialogProps = {
  empireId: string;
  regionId: string;
  inactiveDays: string;
  onClose: () => void;
  onBack?: () => void;
};

const empireDetailsCache = new Map<string, AnyRecord>();

function compactDate(value: unknown) {
  return value ? `${timeAgo(value)} (${dateLabel(value)})` : "Unavailable";
}

export function EmpireDetailsDialog({
  empireId,
  regionId,
  inactiveDays,
  onClose,
  onBack,
}: EmpireDetailsDialogProps) {
  const { request, trackPromise } = useManualRefresh();
  const [tab, setTab] = React.useState<EmpireDetailsTab>("overview");
  const [retry, setRetry] = React.useState(0);
  const cacheKey = `${regionId}:${empireId}:${inactiveDays}`;
  const [state, setState] = React.useState<EmpireDetailsState>({
    data: null,
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    setTab("overview");
  }, [empireId]);

  React.useEffect(() => {
    const cached = empireDetailsCache.get(cacheKey);
    if (!request && cached && retry === 0) {
      setState({ data: cached, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ data: current.data ?? cached ?? null, loading: true, error: null }));
    const params = new URLSearchParams({ empireId, regionId, inactiveDays });
    const refresh = fetch(`/api/local/empires/details?${params}`, { headers: manualRefreshHeaders(request, "empires"), signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`Empire details HTTP ${response.status}`)))
      .then((payload) => {
        empireDetailsCache.set(cacheKey, payload);
        setState({ data: payload, loading: false, error: null });
      });
    void trackPromise("empire-details", refresh)
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : String(error) }));
        }
      });
    return () => controller.abort();
  }, [cacheKey, empireId, inactiveDays, regionId, retry, request?.sequence, trackPromise]);

  const data = state.data;
  const empire = data?.empire ?? {};
  const members: AnyRecord[] = Array.isArray(data?.members) ? data.members : [];
  const claims: AnyRecord[] = Array.isArray(data?.claims) ? data.claims : [];
  const towers: AnyRecord[] = Array.isArray(data?.towers) ? data.towers : [];
  const errors: string[] = Array.isArray(data?.errors) ? data.errors.map(String) : [];
  const energy = presentHexiteReserveMetric(empire.hexiteReserves ?? {}, "energy");
  const watchtowerEnergy = presentHexiteReserveMetric(empire.hexiteReserves ?? {}, "watchtower");
  const tabs: Array<{ id: EmpireDetailsTab; label: string; count?: number }> = [
    { id: "overview", label: "Overview" },
    { id: "members", label: "Members", count: members.length },
    { id: "claims", label: "Claims", count: claims.length },
    { id: "towers", label: "Towers", count: towers.length },
  ];

  return (
    <Dialog
      open
      title={String(empire.name ?? "Empire Details")}
      description="Empire activity, members, claims, towers, and reserves."
      onClose={onClose}
      className="help-dialog empire-details-dialog"
      backdropClassName="help-overlay empires-watchtower-overlay"
    >
      <header>
        <div><Landmark /><h2>{empire.name ?? "Empire Details"}</h2></div>
        <button type="button" onClick={onClose} aria-label="Close empire details"><X size={16} /></button>
      </header>
      <div className="empire-detail-body">
        {onBack ? (
          <button type="button" className="toolbar-button empire-detail-back" onClick={onBack}>
            <ArrowLeft size={14} /> Back to Siege Details
          </button>
        ) : null}
        {state.loading ? <AppSkeleton /> : null}
        {state.error ? (
          <AsyncState
            kind="error"
            title="Unable to load empire details"
            detail={state.error}
            action={<button type="button" className="toolbar-button" onClick={() => setRetry((value) => value + 1)}>Retry</button>}
          />
        ) : null}
        {data ? (
          <>
            <div className="empire-detail-heading">
              <span><Crown size={14} /> Leader: {empire.leader ?? "Unknown"}</span>
              <span><Clock size={14} /> Updated: {compactDate(data.fetchedAt ?? empire.updatedAt)}</span>
            </div>
            {data.stale ? (
              <AsyncState
                kind="stale"
                title="Showing last-good Empire details"
                detail={errors.slice(0, 3).join("; ") || "The last complete Relay generation remains visible."}
                compact
              />
            ) : data.partial || errors.length ? (
              <div className="warning-card">Some empire sources are unavailable: {errors.join("; ")}</div>
            ) : null}
            <div className="empire-detail-summary">
              <span><Users /><small>Members</small><strong>{formatNumber(empire.memberCount ?? members.length)}</strong></span>
              <span><Castle /><small>Claims</small><strong>{formatNumber(empire.numClaims ?? claims.length)}</strong></span>
              <span><MapPin /><small>Territory</small><strong>{formatNumber(empire.territoryChunks)}</strong></span>
              <span><Zap /><small>Hexite Energy</small><strong>{energy.primary}</strong></span>
              <span><RadioTower /><small>Watchtower Energy</small><strong>{watchtowerEnergy.primary}</strong></span>
            </div>
            <div className="empire-detail-tabs" role="tablist" aria-label="Empire detail views">
              {tabs.map((entry) => (
                <button
                  key={entry.id}
                  id={`empire-detail-tab-${entry.id}`}
                  type="button"
                  role="tab"
                  aria-selected={tab === entry.id}
                  aria-controls={`empire-detail-panel-${entry.id}`}
                  className={tab === entry.id ? "active" : ""}
                  onClick={() => setTab(entry.id)}
                >
                  {entry.label}
                  {entry.count == null ? null : <small>{formatNumber(entry.count)}</small>}
                </button>
              ))}
            </div>
            <section
              id={`empire-detail-panel-${tab}`}
              className="empire-detail-panel"
              role="tabpanel"
              aria-labelledby={`empire-detail-tab-${tab}`}
            >
              {tab === "overview" ? (
                <div className="empire-overview-grid">
                  <dl>
                    <div><dt>Online now</dt><dd>{formatNumber(data.activity?.onlineNow)}</dd></div>
                    <div><dt>Active today</dt><dd>{formatNumber(data.activity?.activeToday)}</dd></div>
                    <div><dt>Active this week</dt><dd>{formatNumber(data.activity?.activeThisWeek)}</dd></div>
                  </dl>
                  <dl>
                    <div><dt>Last leader login</dt><dd>{compactDate(empire.lastLeaderLogin)}</dd></div>
                    <div>
                      <dt>Leader activity</dt>
                      <dd><span className={`status-pill ${empire.inactiveRisk ? "warn" : "good"}`}>{empire.inactiveRisk ? "Risk" : "Active"}</span></dd>
                    </div>
                    <div><dt>Regional claims</dt><dd>{formatNumber(empire.regionalClaims)}</dd></div>
                  </dl>
                </div>
              ) : null}
              {tab === "members" ? (
                members.length ? (
                  <div className="empire-detail-list">
                    {members.map((member) => (
                      <article key={member.entityId ?? member.username}>
                        <div>
                          <strong>{member.username ?? "Unknown"}</strong>
                          <small>{member.rankTitle ?? "Citizen"}</small>
                          <div className="empire-detail-flags">
                            {member.hasStorage ? <span><Package size={12} /> Storage</span> : null}
                            {member.canAddHexite ? <span><Hammer size={12} /> Add Hexite</span> : null}
                          </div>
                        </div>
                        <span>{member.signedIn ? "Online now" : compactDate(member.lastLoginTimestamp)}</span>
                      </article>
                    ))}
                  </div>
                ) : <AsyncState kind="empty" title="No current member data available" detail="The current Relay generation contains no members for this empire." compact />
              ) : null}
              {tab === "claims" ? (
                claims.length ? (
                  <div className="empire-detail-list">
                    {claims.map((claim) => (
                      <article key={claim.claimId ?? claim.name}>
                        <div>
                          <strong>{claim.name ?? "Unknown claim"}</strong>
                          <small>{claim.ownerName ?? "Unknown owner"} · {coordinateText(claim)}</small>
                        </div>
                        <span>T{claim.tier ?? "?"} · {formatNumber(claim.supplies)} supplies · {formatGoldAmount(claim.treasury)}</span>
                      </article>
                    ))}
                  </div>
                ) : <AsyncState kind="empty" title="No current claim data available" detail="No regional claims are associated with this empire." compact />
              ) : null}
              {tab === "towers" ? (
                towers.length ? (
                  <div className="empire-detail-list">
                    {towers.map((tower) => (
                      <article key={tower.towerId}>
                        <div>
                          <strong>{tower.nickname ?? "Watchtower"}</strong>
                          <small>{coordinateText(tower)} · {formatNumber(tower.energy)} energy · {formatNumber(tower.upkeep)} upkeep</small>
                        </div>
                        <span className="empire-tower-statuses">
                          <span className={`status-pill ${tower.active ? "good" : "muted"}`}>{tower.active ? "Active" : "Inactive"}</span>
                          {tower.inactiveRisk ? <span className="status-pill warn">Risk</span> : null}
                          {tower.underSiege ? <span className="status-pill danger">Under Siege</span> : <span className="status-pill muted">No siege</span>}
                        </span>
                      </article>
                    ))}
                  </div>
                ) : <AsyncState kind="empty" title="No current tower data available" detail="The current Relay generation contains no claimed Watchtowers for this empire." compact />
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
