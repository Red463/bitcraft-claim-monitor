import React from "react";
import type { AdminTab } from "./adminNavigationState";

export type AdminNavigationItem = { key: AdminTab; label: string; description: string };
export type AdminNavigationGroup = { label: string; tabs: AdminNavigationItem[] };

export function AdminSectionNavigation({ groups, active, onSelect }: {
  groups: AdminNavigationGroup[];
  active: AdminTab;
  onSelect: (tab: AdminTab) => void;
}) {
  const tabs = groups.flatMap((group) => group.tabs);
  const activeTab = tabs.find(({ key }) => key === active);
  const activeGroup = groups.find((group) => group.tabs.some(({ key }) => key === active));
  if (!activeTab) return null;
  return (
    <nav className="admin-tab-groups" aria-label="Admin sections">
      <div className="admin-section-tabs" aria-label="Admin section groups">
        {groups.map((group) => {
          const selected = group.label === activeGroup?.label;
          return <button key={group.label} className={selected ? "active" : ""} aria-pressed={selected} onClick={() => onSelect(group.tabs[0].key)}>{group.label}</button>;
        })}
      </div>
      <div className="admin-nav-divider" aria-hidden="true" />
      <div className="admin-tabs" aria-label={`${activeGroup?.label ?? "Admin"} pages`}>
        {(activeGroup?.tabs ?? tabs).map((item) => (
          <button key={item.key} className={active === item.key ? "active" : ""} aria-current={active === item.key ? "page" : undefined} onClick={() => onSelect(item.key)} title={item.description}>
            <strong>{item.label}</strong>
          </button>
        ))}
      </div>
      <div className="admin-tab-overview" aria-label={`${activeTab.label} overview`}>
        <span>Admin / {activeGroup?.label ?? "General"}</span>
        <h3>{activeTab.label}</h3>
        <p>{activeTab.description}</p>
      </div>
    </nav>
  );
}
