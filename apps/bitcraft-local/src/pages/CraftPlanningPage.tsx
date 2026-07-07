import React from "react";
import { AlertTriangle, ClipboardList, Factory, Package, Route, Target } from "lucide-react";

import { TierBadge } from "../components/main/Badges";
import { DashboardMetric } from "../components/main/DashboardWidgets";
import { DataTable } from "../components/main/DataTable";
import { ItemIcon, ItemLabel } from "../components/main/ItemDisplay";
import { Info } from "../components/main/Stats";
import type { AnyRecord } from "../main-app-data";
import { formatNumber } from "../utils/format";
import { CraftPlanManagerDialog } from "./CraftPlanManagerDialog";

const LOCAL_API = "/api/local";

function itemNode(item: AnyRecord) {
  return (
    <span className="craft-plan-item-label">
      <span className="craft-plan-item-icon"><ItemIcon item={item} /></span>
      <span><ItemLabel item={item} />{item.tier ? <TierBadge tier={item.tier} /> : null}</span>
    </span>
  );
}

function quantity(value: unknown) {
  return formatNumber(Number(value) || 0, 0);
}

export function CraftPlanningPage({ claimId, refreshToken }: { claimId: string; refreshToken: number }) {
  const [plan, setPlan] = React.useState<AnyRecord | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [adminAuth, setAdminAuth] = React.useState<AnyRecord | null>(null);
  const [managerOpen, setManagerOpen] = React.useState(false);
  const [managerRefreshToken, setManagerRefreshToken] = React.useState(0);

  React.useEffect(() => {
    fetch(`${LOCAL_API}/admin/me`)
      .then((response) => response.ok ? response.json() : { authenticated: false })
      .then(setAdminAuth)
      .catch(() => setAdminAuth({ authenticated: false }));
  }, []);

  React.useEffect(() => {
    let stale = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`${LOCAL_API}/craft-plan?claimId=${encodeURIComponent(claimId)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
        if (!stale) setPlan(body);
      })
      .catch((err) => {
        if (!stale && err.name !== "AbortError") setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
      controller.abort();
    };
  }, [claimId, refreshToken, managerRefreshToken]);

  const config = plan?.config ?? {};
  const totals = plan?.totals ?? {};
  const targets = Array.isArray(plan?.targets) ? plan.targets : [];
  const materials = Array.isArray(plan?.materials) ? plan.materials : [];
  const gatherNext = Array.isArray(plan?.gatherNext) ? plan.gatherNext : [];
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  const warnings = Array.isArray(plan?.warnings) ? plan.warnings : [];
  const unavailableSources = Array.isArray(plan?.unavailableSources) ? plan.unavailableSources : [];
  const alternativeSteps = steps.filter((step: AnyRecord) => Number(step.alternatives) > 1);
  const canManage = Boolean(adminAuth?.authenticated && adminAuth?.csrfToken);

  if (loading && !plan) {
    return <div className="panel craft-planning-page"><div className="empty-state"><ClipboardList size={36} /><strong>Loading craft plan</strong><span>Checking targets, sources, active crafts, and recipe routes.</span></div></div>;
  }

  if (error) {
    return <div className="panel craft-planning-page"><div className="empty-state"><AlertTriangle size={36} /><strong>Craft plan unavailable</strong><span>{error}</span></div></div>;
  }

  const hasPlan = Boolean(plan?.enabled && targets.length);

  return (
    <div className="panel craft-planning-page">
      <header className="page-header split-header">
        <div>
          <h2><ClipboardList size={24} /> Craft Planning</h2>
          <p>{hasPlan ? String(config.name ?? "Settlement craft plan") : "Admin-controlled procurement board for settlement crafting goals."}</p>
        </div>
        <div className="top-meta">
          {canManage ? <button className="toolbar-button primary" type="button" onClick={() => setManagerOpen(true)}>Manage Plan</button> : null}
          <span>{quantity(totals.missingItems)} missing items</span>
          <span>{quantity(totals.activeCraftQuantity)} in active crafts</span>
        </div>
      </header>

      {!hasPlan ? (
        <div className="empty-state">
          <Target size={36} />
          <strong>No craft plan configured</strong>
          <span>{canManage ? "Use Manage Plan to add targets, inventory sources, route overrides, and uncertain-drop multipliers." : "An admin can add targets, inventory sources, route overrides, and uncertain-drop multipliers."}</span>
        </div>
      ) : (
        <>
          <section className="stats-grid compact-stats">
            <DashboardMetric icon={<Target />} label="Active targets" value={quantity(totals.targets)} detail={`${quantity(totals.missingQuantity)} total still needed`} />
            <DashboardMetric icon={<Package />} label="Materials missing" value={quantity(totals.missingItems)} detail="after stock and active crafts" tone="gold" />
            <DashboardMetric icon={<Factory />} label="Active crafts counted" value={quantity(totals.activeCraftQuantity)} detail="outputs already in progress" tone="green" />
            <DashboardMetric icon={<AlertTriangle />} label="Unavailable sources" value={quantity(unavailableSources.length)} detail="excluded from stock totals" tone={unavailableSources.length ? "warn" : "green"} />
          </section>

          <section className="form-card craft-plan-section" data-tour="craft-planning-gather-next">
            <div className="split-header"><h3><Target size={17} /> Gather Next</h3><p className="legend">Highest missing buffered materials grouped by likely activity.</p></div>
            {gatherNext.length ? <div className="craft-plan-gather-grid">
              {gatherNext.map((group: AnyRecord) => (
                <article className="craft-plan-gather-card" key={group.section}>
                  <h4>{group.section}</h4>
                  {(Array.isArray(group.items) ? group.items : []).slice(0, 4).map((item: AnyRecord) => (
                    <div className="craft-plan-gather-row" key={item.key}>
                      {itemNode(item)}
                      <strong>{quantity(item.missing)}</strong>
                    </div>
                  ))}
                </article>
              ))}
            </div> : <p className="legend">All planned materials are covered by selected stock sources and active crafts.</p>}
          </section>

          <section className="form-card craft-plan-section">
            <h3><Target size={17} /> Targets</h3>
            <div className="craft-plan-target-grid">
              {targets.map((target: AnyRecord) => (
                <article className="craft-plan-target" key={target.key ?? `${target.kind}:${target.id}`}>
                  {itemNode(target)}
                  <div><Info label="Goal" value={quantity(target.quantity)} /><Info label="Available" value={quantity(target.available)} /><Info label="In progress" value={quantity(target.inProgress)} /><Info label="Still needed" value={quantity(target.missing)} /></div>
                </article>
              ))}
            </div>
          </section>

          <section className="form-card craft-plan-section">
            <h3><Package size={17} /> Materials</h3>
            <DataTable rows={materials} columns={[
              ["Item", (row) => itemNode(row)],
              ["Section", (row) => row.section ?? "Other"],
              ["Required", (row) => quantity(row.required)],
              ["Buffer", (row) => row.multiplier > 1 ? `x${row.multiplier}` : "-"],
              ["Available", (row) => quantity(row.available)],
              ["Active", (row) => quantity(row.inProgress)],
              ["Still needed", (row) => <strong className={row.missing > 0 ? "craft-plan-missing" : ""}>{quantity(row.missing)}</strong>],
            ]} />
          </section>

          <section className="form-card craft-plan-section">
            <h3><Route size={17} /> Recipe Routes</h3>
            {alternativeSteps.length ? <DataTable rows={alternativeSteps} columns={[
              ["Output", (row) => itemNode(row.output ?? row)],
              ["Selected route", (row) => row.recipeName ?? row.selectedRecipeId],
              ["Crafts", (row) => quantity(row.craftCount)],
              ["Alternatives", (row) => quantity(row.alternatives)],
            ]} /> : <p className="legend">No alternate recipe routes were found for the current target chain.</p>}
          </section>

          {warnings.length || unavailableSources.length ? (
            <section className="form-card craft-plan-section warning-card">
              <h3><AlertTriangle size={17} /> Unavailable sources</h3>
              {warnings.map((warning: string) => <p className="legend" key={warning}>{warning}</p>)}
              {unavailableSources.map((source: AnyRecord) => <p className="legend" key={`${source.type}-${source.sourceId}`}>{source.label}: {source.error}</p>)}
            </section>
          ) : null}
        </>
      )}
      {canManage ? <CraftPlanManagerDialog open={managerOpen} onClose={() => setManagerOpen(false)} csrfToken={String(adminAuth?.csrfToken)} onSaved={() => setManagerRefreshToken((value) => value + 1)} /> : null}
    </div>
  );
}
