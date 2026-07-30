import React from "react";
import { AlertTriangle, Landmark, MapPin, Shield, X, Zap } from "lucide-react";
import { Dialog } from "../../components/main/Dialog";
import type { AnyRecord } from "../../main-app-data";
import { dateLabel, formatNumber } from "../../utils/format";
import { groupSiegeParticipants, siegeDurationLabel } from "./siegePresentation";
import { coordinateText } from "./watchtowerPresentation";

type SiegeDetailsDialogProps = {
  tower: AnyRecord;
  onClose: () => void;
  onViewEmpire: (empireId: string) => void;
};

function ParticipantCard({
  participant,
  role,
  onViewEmpire,
}: {
  participant: AnyRecord;
  role: "attacker" | "defender" | "unknown";
  onViewEmpire: (empireId: string) => void;
}) {
  const empireId = String(participant.empireEntityId ?? participant.empireId ?? "").trim();
  const label = role === "attacker"
    ? "Attacking Empire"
    : role === "defender"
      ? "Defending Empire"
      : "Siege Role Unavailable";
  return (
    <article className={`siege-participant-card ${role}`}>
      <div className="siege-participant-head">
        <span className={`status-pill ${role === "attacker" ? "danger" : role === "defender" ? "good" : "muted"}`}>
          {role === "attacker" ? <AlertTriangle size={13} /> : <Shield size={13} />}
          {label}
        </span>
        <button
          type="button"
          className="toolbar-button"
          disabled={!empireId}
          onClick={() => onViewEmpire(empireId)}
        >
          View Empire
        </button>
      </div>
      <dl>
        <div>
          <dt>Empire</dt>
          <dd>{participant.empireName ?? "Unknown empire"}</dd>
        </div>
        <div>
          <dt><Zap size={13} /> {role === "unknown" ? "Siege" : role === "attacker" ? "Attacker" : "Defender"} Energy</dt>
          <dd>{participant.energy == null ? "Unavailable" : formatNumber(participant.energy)}</dd>
        </div>
      </dl>
    </article>
  );
}

export function SiegeDetailsDialog({ tower, onClose, onViewEmpire }: SiegeDetailsDialogProps) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const { attackers, defenders, unknown, startedAt } = groupSiegeParticipants(tower);
  const towerName = String(tower.displayName ?? tower.nickname ?? "Watchtower");

  return (
    <Dialog
      open
      title="Siege Details"
      description={`Detailed siege information for ${towerName}`}
      onClose={onClose}
      className="help-dialog siege-details-dialog"
      backdropClassName="help-overlay empires-watchtower-overlay"
    >
      <header>
        <div><AlertTriangle /><h2>Siege Details</h2></div>
        <button type="button" onClick={onClose} aria-label="Close siege details"><X size={16} /></button>
      </header>
      <div className="siege-dialog-body">
        <p className="tower-access-note">Detailed information about the active siege affecting this Watchtower.</p>
        <section className="siege-tower-information">
          <h3>Tower Information</h3>
          <dl>
            <div><dt><Landmark size={14} /> Name</dt><dd>{towerName}</dd></div>
            <div><dt><MapPin size={14} /> Location</dt><dd>{coordinateText(tower)}</dd></div>
          </dl>
        </section>
        <h3 className="siege-section-title">Active Siege</h3>
        <section className="siege-active-summary">
          <span className="status-pill danger"><AlertTriangle size={13} /> Under Siege</span>
          <dl>
            <div><dt>Siege Duration</dt><dd>{siegeDurationLabel(startedAt, now)}</dd></div>
            <div><dt>Siege Started</dt><dd>{startedAt ? dateLabel(startedAt) : "Unavailable"}</dd></div>
          </dl>
        </section>
        {attackers.map((participant, index) => (
          <ParticipantCard
            key={`attacker:${String(participant.empireEntityId ?? participant.empireId ?? index)}`}
            role="attacker"
            participant={participant}
            onViewEmpire={onViewEmpire}
          />
        ))}
        {defenders.map((participant, index) => (
          <ParticipantCard
            key={`defender:${String(participant.empireEntityId ?? participant.empireId ?? index)}`}
            role="defender"
            participant={participant}
            onViewEmpire={onViewEmpire}
          />
        ))}
        {unknown.map((participant, index) => (
          <ParticipantCard
            key={`unknown:${String(participant.empireEntityId ?? participant.empireId ?? index)}`}
            role="unknown"
            participant={participant}
            onViewEmpire={onViewEmpire}
          />
        ))}
        {!attackers.length && !defenders.length && !unknown.length ? (
          <div className="empty-state compact">Active siege participant details are unavailable.</div>
        ) : null}
      </div>
    </Dialog>
  );
}
