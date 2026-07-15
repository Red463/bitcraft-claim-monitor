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
import type { BotSection } from "./botSectionState";
export type { BotSection } from "./botSectionState";

export const BOT_SECTIONS = [
  ["setup", "Setup", <MessageCircle size={15} />, "Token, application and guild IDs", "Setup"],
  ["notifications", "Notifications", <Bell size={15} />, "Market, craft, supply and update rules", "Automation"],
  ["youtube", "YouTube Monitor", <Youtube size={15} />, "New videos and announcements", "Automation"],
  ["channels", "Channels", <Hash size={15} />, "Discord channel IDs and routing", "Setup"],
  ["roleManager", "Role Manager", <Users size={15} />, "Create and inspect Discord roles", "Roles & Onboarding"],
  ["roles", "Craft Watch", <Bell size={15} />, "Profession notification roles", "Roles & Onboarding"],
  ["colours", "Colour Roles", <Palette size={15} />, "One-click name colour roles", "Roles & Onboarding"],
  ["community", "Role Panels", <UserPlus size={15} />, "Self-assign roles and welcome flow", "Roles & Onboarding"],
  ["moderation", "Moderation", <Shield size={15} />, "Timeouts, bans, purge and ban list", "Moderation"],
  ["safety", "Safety Rules", <Lock size={15} />, "Auto-mod, slowmode, lockdown and nicknames", "Moderation"],
  ["records", "Member Records", <FileText size={15} />, "Warnings, notes, cases and profiles", "Moderation"],
  ["content", "Posts & Events", <MessageCircle size={15} />, "Polls, RSVPs and event posts", "Community Content"],
  ["commands", "Commands", <Command size={15} />, "Custom slash command responses", "Community Content"],
  ["tools", "Community Tools", <Wrench size={15} />, "Reports and one-off announcements", "Community Content"],
  ["tests", "Command Tests", <Command size={15} />, "Preview commands before publishing; compare Diagnostics when delivery fails", "Troubleshooting"],
  ["diagnostics", "Delivery Diagnostics", <Activity size={15} />, "Inspect delivery logs; use Tests to reproduce command issues", "Troubleshooting"],
] as const;

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
