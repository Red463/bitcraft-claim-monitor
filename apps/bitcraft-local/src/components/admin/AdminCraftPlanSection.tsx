import React from "react";
import { ClipboardList, ExternalLink } from "lucide-react";

export function AdminCraftPlanSection() {
  return (
    <section className="form-card nested-card admin-craft-plan-card">
      <div className="split-header">
        <div>
          <h3><ClipboardList size={17} /> Craft Planning</h3>
          <p className="legend">Craft Planning is managed from its full page so source selection, target presets, and route controls have enough room.</p>
        </div>
        <button className="toolbar-button primary" type="button" onClick={() => { window.location.href = "/?page=planning"; }}>
          <ExternalLink size={14} /> Open Manager
        </button>
      </div>
    </section>
  );
}
