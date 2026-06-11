import { AlertTriangle, Box, Hammer, Package } from "lucide-react";
import { MiniStat } from "../components/main/Stats";
import {
  buildConstructionProjects,
  constructionNeededMaterials,
  toNumber,
  type AnyRecord,
} from "../main-app-data";
import { formatNumber } from "../utils/format";
import { normalizeData } from "../utils/normalize";

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

export function Construction({ data }: { data: ReturnType<typeof normalizeData> }) {
  const projects = buildConstructionProjects(data.construction, data.inventories);
  const needed = constructionNeededMaterials(projects);
  const totalMaterialsRequired = projects.reduce((sum: number, project: AnyRecord) => sum + (project.materials ?? []).reduce((inner: number, mat: AnyRecord) => inner + toNumber(mat.required), 0), 0);
  const totalMaterialsContributed = projects.reduce((sum: number, project: AnyRecord) => sum + materialCompletion(project.materials).contributed, 0);
  const totalMissingMaterials = needed.reduce((sum: number, [, amount]) => sum + toNumber(amount), 0);
  const materialsAddedPct = totalMaterialsRequired ? Math.min(100, Math.round((totalMaterialsContributed / totalMaterialsRequired) * 100)) : projects.length ? 100 : 0;
  return (
    <div className="panel construction-page">
      <header className="members-topbar construction-topbar">
        <div>
          <h2>Construction Projects</h2>
          <p>{projects.length} active project{projects.length === 1 ? "" : "s"}</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span><Hammer size={14} /> {formatNumber(projects.length)} active</span>
            <span>{formatNumber(needed.length)} material types needed</span>
          </div>
          <div className="dashboard-settlement-pill">
            <span className="status-pill">{materialsAddedPct}%</span>
            <span>Materials added</span>
          </div>
        </div>
      </header>
      <div className="summary-grid construction-summary">
        <MiniStat icon={<Hammer />} label="Active Projects" value={formatNumber(projects.length)} />
        <MiniStat icon={<Package />} label="Materials Added" value={formatNumber(totalMaterialsContributed)} />
        <MiniStat icon={<Box />} label="Materials Required" value={formatNumber(totalMaterialsRequired)} />
        <MiniStat icon={<AlertTriangle />} label="Still Needed" value={formatNumber(totalMissingMaterials)} />
      </div>
      {needed.length ? (
        <section className="warning-section">
          <h3><AlertTriangle size={15} /> What to Gather Next</h3>
          <div className="gather-grid">{needed.map(([name, amount]) => <MiniStat key={name} icon={<Package />} label={name} value={formatNumber(amount)} />)}</div>
        </section>
      ) : null}
      <div className="project-list">
        {projects.length ? projects.map((project: AnyRecord) => {
          const { contributed, pct, remaining, required } = materialCompletion(project.materials);
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
              <div className="construction-material-grid">
                {project.materials.map((mat: AnyRecord, index: number) => {
                  const required = toNumber(mat.required);
                  const contributed = toNumber(mat.contributed);
                  const stored = toNumber(mat.stored);
                  const projectRemaining = Math.max(0, required - contributed);
                  const uncovered = Math.max(0, projectRemaining - stored);
                  const matPct = required ? Math.min(100, Math.round((contributed / required) * 100)) : 100;
                  return (
                    <div className={`construction-material-card ${uncovered ? "needs-material" : projectRemaining ? "available-material" : "complete"}`} key={`${mat.type}-${mat.itemId}-${index}`}>
                      <div>
                        <strong>{mat.name}</strong>
                        <span>{formatNumber(contributed)} / {formatNumber(required)} added</span>
                      </div>
                      <div className="progress"><div style={{ width: `${matPct}%` }} /></div>
                      <dl>
                        <div><dt>Storage</dt><dd>{formatNumber(stored)}</dd></div>
                        <div><dt>Need</dt><dd>{formatNumber(uncovered)}</dd></div>
                      </dl>
                    </div>
                  );
                })}
              </div>
            </article>
          );
        }) : <div className="empty-state"><Hammer />No active construction projects.</div>}
      </div>
    </div>
  );
}
