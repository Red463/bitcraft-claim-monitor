import React from "react";
import "../styles/construction.css";
import { AlertTriangle, Box, CheckCircle2, ChevronDown, Hammer, Package, Search } from "lucide-react";
import { TierBadge } from "../components/main/Badges";
import { ItemIcon } from "../components/main/ItemDisplay";
import { PageHeader } from "../components/main/PageHeader";
import { MiniStat } from "../components/main/Stats";
import {
  buildConstructionProjects,
  toNumber,
  type AnyRecord,
} from "../main-app-data";
import { formatNumber } from "../utils/format";
import { normalizeData } from "../utils/normalize";

// Construction projects are displayed from BitJita's current project/material
// shape. The page focuses on material readiness rather than build progress,
// because the final construction action is usually quick once all materials are
// supplied.
function materialCompletion(materials: AnyRecord[] = []) {
  const required = materials.reduce((sum: number, mat: AnyRecord) => sum + toNumber(mat.required), 0);
  const contributed = materials.reduce((sum: number, mat: AnyRecord) => {
    const requiredAmount = toNumber(mat.required);
    return sum + Math.min(requiredAmount, toNumber(mat.contributed));
  }, 0);
  const remaining = materials.reduce((sum: number, mat: AnyRecord) => sum + Math.max(0, toNumber(mat.required) - toNumber(mat.contributed)), 0);
  const pct = required ? Math.min(100, Math.round((contributed / required) * 100)) : 100;
  return { contributed, pct, remaining, required };
}

function materialProgress(material: AnyRecord) {
  const required = toNumber(material.required);
  const contributed = toNumber(material.contributed);
  const stored = toNumber(material.stored);
  const projectRemaining = Math.max(0, required - contributed);
  const uncovered = Math.max(0, projectRemaining - stored);
  const coveredByStorage = Math.min(projectRemaining, stored);
  const pct = required ? Math.min(100, Math.round((Math.min(required, contributed) / required) * 100)) : 100;
  return { contributed, coveredByStorage, pct, projectRemaining, required, stored, uncovered };
}

function constructionShoppingList(projects: AnyRecord[]) {
  const grouped = new Map<string, AnyRecord>();
  for (const project of projects) {
    for (const material of project.materials ?? []) {
      const progress = materialProgress(material);
      if (progress.uncovered <= 0) continue;
      const key = `${material.type}:${material.itemId}`;
      const current = grouped.get(key) ?? {
        ...material,
        missing: 0,
        projectCount: 0,
        projects: [] as string[],
      };
      current.missing += progress.uncovered;
      current.projectCount += 1;
      current.projects.push(String(project.name ?? "Construction project"));
      grouped.set(key, current);
    }
  }
  return [...grouped.values()].sort((a, b) => toNumber(b.missing) - toNumber(a.missing) || String(a.name).localeCompare(String(b.name)));
}

export function Construction({ data }: { data: ReturnType<typeof normalizeData> }) {
  const [showAllNeeded, setShowAllNeeded] = React.useState(false);
  const [showCompleteMaterials, setShowCompleteMaterials] = React.useState(false);
  const [hideCompleteProjects, setHideCompleteProjects] = React.useState(true);
  const [sortMode, setSortMode] = React.useState<"blocked" | "leastComplete" | "name">("blocked");
  const projects = buildConstructionProjects(data.construction, data.inventories);
  const needed = constructionShoppingList(projects);
  const visibleNeeded = showAllNeeded ? needed : needed.slice(0, 8);
  const totalMaterialsRequired = projects.reduce((sum: number, project: AnyRecord) => sum + (project.materials ?? []).reduce((inner: number, mat: AnyRecord) => inner + toNumber(mat.required), 0), 0);
  const totalMaterialsContributed = projects.reduce((sum: number, project: AnyRecord) => sum + materialCompletion(project.materials).contributed, 0);
  const totalMissingMaterials = needed.reduce((sum: number, material) => sum + toNumber(material.missing), 0);
  const materialsAddedPct = totalMaterialsRequired ? Math.min(100, Math.round((totalMaterialsContributed / totalMaterialsRequired) * 100)) : projects.length ? 100 : 0;
  const sortedProjects = [...projects]
    .filter((project) => !hideCompleteProjects || materialCompletion(project.materials).remaining > 0)
    .sort((a, b) => {
      const aStatus = materialCompletion(a.materials);
      const bStatus = materialCompletion(b.materials);
      if (sortMode === "name") return String(a.name).localeCompare(String(b.name));
      if (sortMode === "leastComplete") return aStatus.pct - bStatus.pct || bStatus.remaining - aStatus.remaining;
      return bStatus.remaining - aStatus.remaining || aStatus.pct - bStatus.pct;
    });
  return (
    <div className="panel construction-page" data-tour="construction-page">
      <PageHeader
        title="Construction"
        description={`${projects.length} active project${projects.length === 1 ? "" : "s"}`}
        meta={<div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Hammer size={14} /> {formatNumber(projects.length)} active</span>
            <span>{formatNumber(needed.length)} material types needed</span>
          </div>
          <div className="dashboard-settlement-pill">
            <span className="status-pill">{materialsAddedPct}%</span>
            <span>Materials added</span>
          </div>
        </div>}
      />
      <div className="summary-grid construction-summary">
        <MiniStat icon={<Hammer />} label="Active Projects" value={formatNumber(projects.length)} />
        <MiniStat icon={<Package />} label="Materials Added" value={formatNumber(totalMaterialsContributed)} />
        <MiniStat icon={<Box />} label="Materials Required" value={formatNumber(totalMaterialsRequired)} />
        <MiniStat icon={<AlertTriangle />} label="Still Needed" value={formatNumber(totalMissingMaterials)} />
      </div>
      {needed.length ? (
        <section className="warning-section">
          <div className="construction-section-heading">
            <div>
              <h3><AlertTriangle size={15} /> What to Gather Next</h3>
              <p>Consolidated missing materials after storage has been counted.</p>
            </div>
            {needed.length > 8 ? <button className="toolbar-button" onClick={() => setShowAllNeeded((value) => !value)}>{showAllNeeded ? "Show top 8" : `Show all ${needed.length}`}</button> : null}
          </div>
          <div className="gather-grid">
            {visibleNeeded.map((material) => (
              <article className="construction-need-card" key={`${material.type}-${material.itemId}`}>
                <ItemIcon item={material} />
                <div>
                  <strong>{material.name}</strong>
                  <span>{formatNumber(material.projectCount)} project{material.projectCount === 1 ? "" : "s"}</span>
                </div>
                {material.tier ? <TierBadge tier={material.tier} /> : null}
                <b>{formatNumber(material.missing)}</b>
                <small>{material.projects.slice(0, 2).join(", ")}{material.projects.length > 2 ? ` +${material.projects.length - 2}` : ""}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <section className="construction-controls">
        <div>
          <span><Search size={14} /> Project view</span>
          <p>{formatNumber(sortedProjects.length)} of {formatNumber(projects.length)} projects shown</p>
        </div>
        <label className="toggle-row"><input type="checkbox" checked={hideCompleteProjects} onChange={(event) => setHideCompleteProjects(event.target.checked)} /><span>Needs materials only</span></label>
        <label className="toggle-row"><input type="checkbox" checked={showCompleteMaterials} onChange={(event) => setShowCompleteMaterials(event.target.checked)} /><span>Show completed materials</span></label>
        <label className="construction-sort-field">
          <span>Sort</span>
          <select className="select-control" value={sortMode} onChange={(event) => setSortMode(event.target.value as "blocked" | "leastComplete" | "name")}>
            <option value="blocked">Most materials needed</option>
            <option value="leastComplete">Least complete</option>
            <option value="name">Structure name</option>
          </select>
        </label>
      </section>
      <div className="project-list">
        {sortedProjects.length ? sortedProjects.map((project: AnyRecord) => {
          const { contributed, pct, remaining, required } = materialCompletion(project.materials);
          const incompleteMaterials = (project.materials ?? []).filter((mat: AnyRecord) => materialProgress(mat).projectRemaining > 0);
          const completeMaterials = (project.materials ?? []).filter((mat: AnyRecord) => materialProgress(mat).projectRemaining <= 0);
          const visibleMaterials = showCompleteMaterials ? [...incompleteMaterials, ...completeMaterials] : incompleteMaterials;
          return (
            <article className="project-card" key={project.entityId}>
              <header>
                <div><Hammer size={15} /><strong>{project.name}</strong><small>{remaining ? `${formatNumber(remaining)} materials remaining` : "Materials complete"}</small></div>
                <span className="project-progress-badge">{pct}%</span>
              </header>
              <div className="project-progress-row">
                <div className="progress"><div style={{ width: `${pct}%` }} /></div>
                <small>{formatNumber(contributed)} / {formatNumber(required)} materials added</small>
              </div>
              {visibleMaterials.length ? (
                <div className="construction-material-list">
                  {visibleMaterials.map((mat: AnyRecord, index: number) => {
                  const { contributed, coveredByStorage, pct: matPct, projectRemaining, required, stored, uncovered } = materialProgress(mat);
                  const complete = projectRemaining <= 0;
                  return (
                    <div className={`construction-material-row ${uncovered ? "needs-material" : projectRemaining ? "available-material" : "complete"}`} key={`${mat.type}-${mat.itemId}-${index}`}>
                      <ItemIcon item={mat} />
                      <div className="construction-material-main">
                        <div>
                          <strong>{mat.name}</strong>
                          {mat.tier ? <TierBadge tier={mat.tier} /> : null}
                          {complete ? <span className="construction-material-status complete"><CheckCircle2 size={12} /> Complete</span> : uncovered ? <span className="construction-material-status needed">Need {formatNumber(uncovered)}</span> : <span className="construction-material-status covered">In storage</span>}
                        </div>
                        <span>{formatNumber(contributed)} / {formatNumber(required)} added{coveredByStorage ? ` - ${formatNumber(coveredByStorage)} available in storage` : ""}</span>
                        <div className="progress"><div style={{ width: `${matPct}%` }} /></div>
                      </div>
                      <div className="construction-material-numbers">
                        <span>Storage <b>{formatNumber(stored)}</b></span>
                        <span>Need <b>{formatNumber(uncovered)}</b></span>
                      </div>
                    </div>
                  );
                })}
                </div>
              ) : (
                <div className="construction-complete-note"><CheckCircle2 size={15} /> All required materials have been added.</div>
              )}
              {!showCompleteMaterials && completeMaterials.length ? (
                <button className="construction-complete-toggle" onClick={() => setShowCompleteMaterials(true)}>
                  <ChevronDown size={14} /> Show {formatNumber(completeMaterials.length)} completed material{completeMaterials.length === 1 ? "" : "s"}
                </button>
              ) : null}
            </article>
          );
        }) : <div className="empty-state"><Hammer />{projects.length ? "No projects match the current filters." : "No active construction projects."}</div>}
      </div>
    </div>
  );
}
import "../styles/construction.css";
