import React from "react";
import {
  Activity,
  Bell,
  Command,
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

export const BOT_SECTIONS = [
  ["setup", "Setup", <MessageCircle size={15} />, "Token, application and guild IDs", "Core"],
  ["notifications", "Notifications", <Bell size={15} />, "Market, craft, supply and update rules", "Automation"],
  ["channels", "Channels", <Hash size={15} />, "Discord channel IDs and routing", "Routing"],
  ["roleManager", "Role Manager", <Users size={15} />, "Create and inspect Discord roles", "Roles"],
  ["roles", "Craft Watch", <Bell size={15} />, "Profession notification roles", "Roles"],
  ["colours", "Colour Roles", <Palette size={15} />, "One-click name colour roles", "Roles"],
  ["community", "Role Panels", <UserPlus size={15} />, "Self-assign roles and welcome flow", "Roles"],
  ["moderation", "Moderation", <Shield size={15} />, "Timeouts, bans, purge and ban list", "Management"],
  ["safety", "Safety Rules", <Lock size={15} />, "Auto-mod, slowmode, lockdown and nicknames", "Management"],
  ["records", "Member Records", <FileText size={15} />, "Warnings, notes, cases and profiles", "Management"],
  ["content", "Posts & Events", <MessageCircle size={15} />, "Polls, RSVPs and clean embeds", "Community"],
  ["commands", "Commands", <Command size={15} />, "Custom slash command responses", "Community"],
  ["tools", "Tools", <Wrench size={15} />, "Reports, announcements and events", "Community"],
  ["tests", "Tests", <Command size={15} />, "Slash command registration and previews", "Management"],
  ["diagnostics", "Diagnostics", <Activity size={15} />, "Delivery log and troubleshooting", "Management"],
] as const;

export type BotSection = (typeof BOT_SECTIONS)[number][0];

const BOT_SECTION_GROUPS = Array.from(new Set(BOT_SECTIONS.map((section) => section[4])));

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
          {BOT_SECTIONS.filter((section) => section[4] === group).map(([key, label, icon, description]) => (
            <button key={key} className={active === key ? "active" : ""} onClick={() => onSelect(key)}>
              {icon}
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
