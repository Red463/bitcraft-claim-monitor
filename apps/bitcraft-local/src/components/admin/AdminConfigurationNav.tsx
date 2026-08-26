import React from "react";
import type { ConfigurationSection } from "./adminNavigationState";
import { CONFIGURATION_SECTIONS } from "./adminConfigurationState";

export function AdminConfigurationNav({ active, onSelect }: {
  active: ConfigurationSection;
  onSelect: (section: ConfigurationSection) => void;
}) {
  return (
    <nav className="admin-configuration-nav" aria-label="Configuration categories">
      <label className="admin-configuration-select">
        <span>Configuration category</span>
        <select value={active} onChange={(event) => onSelect(event.target.value as ConfigurationSection)}>
          {CONFIGURATION_SECTIONS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      <div className="admin-configuration-tabs">
        {CONFIGURATION_SECTIONS.map(({ id, label, description }) => (
          <button key={id} type="button" className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} onClick={() => onSelect(id)}>
            <strong>{label}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
