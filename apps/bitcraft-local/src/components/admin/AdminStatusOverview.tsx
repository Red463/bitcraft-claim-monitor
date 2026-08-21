import React from "react";
import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";
import { classifyAdminCondition } from "./adminStatusPresentation";

export type AdminStatusCondition = {
  label: string;
  detail: string;
  configured?: boolean;
  ok?: boolean;
  critical?: boolean;
  optional?: boolean;
  localDevelopment?: boolean;
};

export function AdminStatusOverview({ conditions }: { conditions: AdminStatusCondition[] }) {
  const groups = [
    { severity: "action", label: "Needs action", Icon: AlertTriangle },
    { severity: "degraded", label: "Degraded or unavailable", Icon: CircleHelp },
    { severity: "healthy", label: "Healthy", Icon: CheckCircle2 },
  ] as const;
  return (
    <section className="admin-condition-groups" aria-label="Operational conditions">
      {groups.map(({ severity, label, Icon }) => {
        const items = conditions.filter((condition) => classifyAdminCondition(condition) === severity);
        if (!items.length) return null;
        return <div className={`admin-condition-group ${severity}`} key={severity}>
          <h3><Icon size={16} /> {label} <span>{items.length}</span></h3>
          {items.map((item) => <article key={item.label}><strong>{item.label}</strong><span>{item.detail}</span></article>)}
        </div>;
      })}
    </section>
  );
}
