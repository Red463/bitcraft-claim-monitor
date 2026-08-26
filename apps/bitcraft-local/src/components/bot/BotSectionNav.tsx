import React from "react";
import {
  Activity,
  Bell,
  Command,
  Youtube,
  FileText,
  Hash,
  Lock,
  MessageCircle,
  Palette,
  Shield,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { BOT_SECTION_DEFINITIONS, BOT_SECTION_GROUPS, type BotSection, type BotSectionIcon } from "./botSectionState";
export type { BotSection } from "./botSectionState";

const BOT_SECTION_ICONS = {
  activity: <Activity size={15} />,
  bell: <Bell size={15} />,
  command: <Command size={15} />,
  youtube: <Youtube size={15} />,
  file: <FileText size={15} />,
  hash: <Hash size={15} />,
  lock: <Lock size={15} />,
  message: <MessageCircle size={15} />,
  palette: <Palette size={15} />,
  shield: <Shield size={15} />,
  userPlus: <UserPlus size={15} />,
  users: <Users size={15} />,
  wrench: <Wrench size={15} />,
} satisfies Record<BotSectionIcon, React.ReactNode>;

export function BotSectionNav({ active, onSelect }: { active: BotSection; onSelect: (section: BotSection) => void }) {
  return (
    <aside className="bot-section-nav" aria-label="Bot settings sections">
      <div className="bot-nav-title">
        <strong>Bot Control</strong>
        <span>Grouped bot settings</span>
      </div>
      {BOT_SECTION_GROUPS.map((group) => (
        <div className="bot-nav-group" key={group}>
          <p>{group}</p>
          {BOT_SECTION_DEFINITIONS.filter((section) => section.group === group).map(({ id, label, icon, description }) => (
            <button key={id} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} onClick={() => onSelect(id)}>
              {BOT_SECTION_ICONS[icon]}
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}
