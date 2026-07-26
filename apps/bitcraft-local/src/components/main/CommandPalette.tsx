import React from "react";
import { Bell, Calculator, CircleDollarSign, Search, ShoppingBag, User } from "lucide-react";
import type { AnyRecord } from "../../main-app-data";
import { NAV, type NavItem } from "../../navigation";
import { activatePagePaletteCommand, buildPagePaletteCommands } from "../../navigation/paletteCommands";
import type { ActivePanel } from "../../types/app";
import { effectiveTargetAllowed, targetIdForTab, type EffectiveAccess } from "../../access/accessControl.mjs";
import { Dialog } from "./Dialog";

function memberName(member: AnyRecord): string {
  return String(member.userName ?? member.username ?? "Member");
}

export function CommandPalette({
  navItems,
  access,
  members,
  onClose,
  onNavigate,
  onSelectMember,
}: {
  navItems: readonly NavItem[];
  access?: EffectiveAccess | null;
  members: AnyRecord[];
  onClose: () => void;
  onNavigate: (panel: ActivePanel, marketTab?: string) => void;
  onSelectMember: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const q = query.toLowerCase().trim();
  const allowedPages = new Set(navItems.map(([id]) => id));
  const marketViewAllowed = (tab: "browse" | "deal-watch" | "buy-orders") => allowedPages.has("market") && effectiveTargetAllowed(access, targetIdForTab("market", tab));
  const commands = [
    ...buildPagePaletteCommands(NAV, allowedPages).map((command) => {
      const Icon = command.icon;
      return {
        ...command,
        icon: <Icon size={15} />,
        allowed: true,
        run: () => activatePagePaletteCommand(command, onNavigate),
      };
    }),
    { key: "price-finder", label: "Market Browse", description: "Find global listings and price history", icon: <CircleDollarSign size={15} />, allowed: marketViewAllowed("browse"), locked: false, run: () => onNavigate("market", "browse") },
    { key: "deal-watchlist", label: "Deal Watch", description: "Manage watched market deals", icon: <Bell size={15} />, allowed: marketViewAllowed("deal-watch"), locked: false, run: () => onNavigate("market", "deal-watch") },
    { key: "buy-order-finder", label: "Buy Orders", description: "Find active global buy orders", icon: <ShoppingBag size={15} />, allowed: marketViewAllowed("buy-orders"), locked: false, run: () => onNavigate("market", "buy-orders") },
    { key: "craft-calculator", label: "Craft Calculator", description: "Calculate recipe chains", icon: <Calculator size={15} />, allowed: allowedPages.has("craftcalc"), locked: false, run: () => onNavigate("craftcalc") },
    ...(allowedPages.has("members") ? members : []).map((member) => ({
      key: `member-${member.playerEntityId}`,
      label: memberName(member),
      description: "Open member details",
      icon: <User size={15} />,
      allowed: true,
      locked: false,
      run: () => {
        onSelectMember(String(member.playerEntityId));
        onNavigate("members");
      },
    })),
  ].filter((command) => command.allowed && (!q || `${command.label} ${command.description}`.toLowerCase().includes(q))).slice(0, 12);

  return (
    <Dialog open title="Quick navigation" onClose={onClose} initialFocusRef={searchRef} className="command-palette" backdropClassName="command-overlay">
        <label>
          <Search size={17} />
          <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Navigate or find a member..." />
        </label>
        <div>
          {commands.map((command) => (
            <button key={command.key} aria-disabled={command.locked} onClick={() => { if (command.locked) return; command.run(); onClose(); }}>
              {command.icon}
              <strong>{command.label}</strong>
              <span>{command.description}</span>
            </button>
          ))}
        </div>
    </Dialog>
  );
}
