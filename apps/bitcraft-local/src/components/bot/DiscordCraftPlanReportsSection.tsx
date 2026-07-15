import React from "react";
import { BellRing, Copy, Plus, Send, Trash2 } from "lucide-react";

type AnyRecord = Record<string, any>;

const professions = ["Carpentry", "Cooking", "Farming", "Fishing", "Foraging", "Forestry", "Hunting", "Leatherworking", "Masonry", "Mining", "Scholar", "Smithing", "Tailoring"];
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const suggestedTimezones = ["Europe/London", "UTC", "Europe/Paris", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Australia/Sydney"];

function newRule(source: AnyRecord = {}) {
  return {
    id: source.id ?? (globalThis.crypto?.randomUUID?.() ?? `report-${Date.now()}`),
    enabled: source.enabled ?? true,
    reportType: source.reportType ?? "overview",
    profession: source.profession ?? "",
    channelId: source.channelId ?? "",
    frequency: source.frequency ?? "daily",
    time: source.time ?? "09:00",
    dayOfWeek: source.dayOfWeek ?? 1,
  };
}

function scheduleLabel(rule: AnyRecord, timezone: string) {
  const prefix = rule.frequency === "weekly" ? `${weekdays[Number(rule.dayOfWeek) || 0]}s` : "Daily";
  return `${prefix} at ${rule.time || "09:00"} · ${timezone || "Europe/London"}`;
}

export function DiscordCraftPlanReportsSection({
  settings,
  channelIdSelect,
  roleIdSelect,
  onChange,
  onTest,
  renderTestAction,
}: {
  settings: AnyRecord;
  channelIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  roleIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  onChange: (value: AnyRecord) => void;
  onTest: (rule: AnyRecord) => Promise<void> | void;
  renderTestAction?: (rule: AnyRecord) => React.ReactNode;
}) {
  const value = settings ?? { scheduledEnabled: false, commandRoleId: "", timezone: "Europe/London", rules: [] };
  const rules: AnyRecord[] = Array.isArray(value.rules) ? value.rules : [];
  const patch = (next: Partial<AnyRecord>) => onChange({ ...value, ...next });
  const updateRule = (id: string, next: Partial<AnyRecord>) => patch({ rules: rules.map((rule) => rule.id === id ? { ...rule, ...next } : rule) });
  const addRule = (source?: AnyRecord) => patch({ rules: [...rules, newRule(source ? { ...source, id: undefined } : {})] });

  return (
    <div className="discord-craft-plan-reports">
      <div className="split-header discord-craft-plan-heading">
        <div>
          <h4><BellRing size={16} /> Craft Planner reports</h4>
          <p className="legend">Post current plan progress automatically, or let an approved Discord role request it with <strong>/craft-plan</strong>.</p>
        </div>
        <button className="toolbar-button" type="button" onClick={() => addRule()}><Plus size={14} /> Add report</button>
      </div>
      <div className="discord-craft-plan-controls">
        <label className="toggle-line">
          <input type="checkbox" checked={Boolean(value.scheduledEnabled)} onChange={(event) => patch({ scheduledEnabled: event.target.checked })} />
          <span>Scheduled reports</span>
        </label>
        <label className="field">
          <span>Command access role</span>
          {roleIdSelect(String(value.commandRoleId ?? ""), (commandRoleId) => patch({ commandRoleId }))}
          <small>Discord administrators can always use the command.</small>
        </label>
        <label className="field">
          <span>Timezone</span>
          <input list="craft-plan-report-timezones" value={String(value.timezone ?? "Europe/London")} onChange={(event) => patch({ timezone: event.target.value })} placeholder="Europe/London" />
          <datalist id="craft-plan-report-timezones">{suggestedTimezones.map((timezone) => <option key={timezone} value={timezone} />)}</datalist>
        </label>
      </div>
      {rules.length ? <div className="discord-craft-plan-rule-list">
        {rules.map((rule, index) => (
          <div className="discord-craft-plan-rule" key={rule.id}>
            <div className="discord-craft-plan-rule-head">
              <label className="toggle-line compact">
                <input type="checkbox" checked={Boolean(rule.enabled)} onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })} />
                <span>Report {index + 1}</span>
              </label>
              <span className={`status-pill ${rule.lastOccurrence?.status === "failed" ? "bad" : rule.lastOccurrence?.status === "sent" ? "good" : ""}`}>{rule.lastOccurrence?.status ?? "Not sent"}</span>
            </div>
            <div className="discord-craft-plan-rule-fields">
              <label className="field"><span>Report</span><select value={rule.reportType ?? "overview"} onChange={(event) => updateRule(rule.id, { reportType: event.target.value, profession: event.target.value === "overview" ? "" : (rule.profession || "carpentry") })}><option value="overview">Overview</option><option value="profession">Profession</option></select></label>
              {rule.reportType === "profession" ? <label className="field"><span>Profession</span><select value={rule.profession ?? ""} onChange={(event) => updateRule(rule.id, { profession: event.target.value })}>{professions.map((profession) => <option key={profession} value={profession.toLowerCase()}>{profession}</option>)}</select></label> : null}
              <label className="field"><span>Channel</span>{channelIdSelect(String(rule.channelId ?? ""), (channelId) => updateRule(rule.id, { channelId }))}</label>
              <label className="field"><span>Frequency</span><select value={rule.frequency ?? "daily"} onChange={(event) => updateRule(rule.id, { frequency: event.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label>
              {rule.frequency === "weekly" ? <label className="field"><span>Day</span><select value={Number(rule.dayOfWeek) || 0} onChange={(event) => updateRule(rule.id, { dayOfWeek: Number(event.target.value) })}>{weekdays.map((day, dayOfWeek) => <option key={day} value={dayOfWeek}>{day}</option>)}</select></label> : null}
              <label className="field"><span>Time</span><input type="time" value={rule.time ?? "09:00"} onChange={(event) => updateRule(rule.id, { time: event.target.value })} /></label>
            </div>
            <div className="discord-craft-plan-rule-status">
              <span>{scheduleLabel(rule, String(value.timezone ?? "Europe/London"))}</span>
              <small>{rule.nextOccurrenceAt ? `Next ${new Date(rule.nextOccurrenceAt).toLocaleString()}` : "Save settings to calculate the next post."}</small>
              {rule.lastOccurrence?.error ? <small className="error-text">{rule.lastOccurrence.error}</small> : null}
            </div>
            <div className="discord-craft-plan-rule-actions">
              {renderTestAction?.(rule) ?? <button className="toolbar-button" type="button" disabled={!rule.channelId} onClick={() => void onTest(rule)}><Send size={13} /> Send test</button>}
              <button className="toolbar-button" type="button" onClick={() => addRule(rule)}><Copy size={13} /> Duplicate</button>
              <button className="toolbar-button danger" type="button" onClick={() => patch({ rules: rules.filter((entry) => entry.id !== rule.id) })}><Trash2 size={13} /> Delete</button>
            </div>
          </div>
        ))}
      </div> : <div className="discord-craft-plan-empty"><strong>No scheduled reports yet.</strong><span>Add an overview or profession report. The /craft-plan command can still be used once an access role is selected.</span></div>}
    </div>
  );
}
