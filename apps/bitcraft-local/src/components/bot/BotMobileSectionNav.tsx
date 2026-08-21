import React from "react";
import { BOT_SECTION_DEFINITIONS, BOT_SECTION_GROUPS, type BotSection } from "./botSectionState";

export function BotMobileSectionNav({ active, onSelect }: { active: BotSection; onSelect: (section: BotSection) => void }) {
  const current = BOT_SECTION_DEFINITIONS.find(({ id }) => id === active) ?? BOT_SECTION_DEFINITIONS[0];

  return (
    <section className="bot-mobile-section-nav" aria-label="Discord tool navigation">
      <label htmlFor="bot-mobile-section-select">Discord tool</label>
      <select
        id="bot-mobile-section-select"
        value={active}
        onChange={(event) => onSelect(event.target.value as BotSection)}
      >
        {BOT_SECTION_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {BOT_SECTION_DEFINITIONS.filter((section) => section.group === group).map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      <div className="bot-mobile-section-current" aria-current="page">
        <strong>{current.label}</strong>
        <span>{current.description}</span>
      </div>
      <details>
        <summary>Browse tools</summary>
        <div className="bot-mobile-section-list">
          {BOT_SECTION_GROUPS.map((group) => (
            <div key={group}>
              <p>{group}</p>
              {BOT_SECTION_DEFINITIONS.filter((section) => section.group === group).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={active === id ? "active" : ""}
                  aria-current={active === id ? "page" : undefined}
                  onClick={() => onSelect(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
