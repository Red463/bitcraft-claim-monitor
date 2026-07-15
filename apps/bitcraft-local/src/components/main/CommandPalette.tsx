import React from "react";
import { Bell, Calculator, CircleDollarSign, Search, ShoppingBag, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ActivePanel } from "../../types/app";
import type { AnyRecord } from "../../main-app-data";
import { effectiveTargetAllowed, targetIdForTab, type EffectiveAccess } from "../../access/accessControl.mjs";
import { Dialog } from "./Dialog";

type NavItem = readonly [ActivePanel, string, LucideIcon];

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
  const marketViewAllowed = (tab: "pricing" | "dealWatchlist" | "buyOrders") => allowedPages.has("market") && effectiveTargetAllowed(access, targetIdForTab("market", tab));
  const commands = [
    ...navItems.map(([id, label, Icon]) => ({ key: `page-${id}`, label, description: "Open page", icon: <Icon size={15} />, allowed: true, run: () => onNavigate(id) })),
    { key: "price-finder", label: "Price Finder", description: "Find a listing price", icon: <CircleDollarSign size={15} />, allowed: marketViewAllowed("pricing"), run: () => onNavigate("market", "pricing") },
    { key: "deal-watchlist", label: "Deal Watchlist", description: "Manage watched market deals", icon: <Bell size={15} />, allowed: marketViewAllowed("dealWatchlist"), run: () => onNavigate("market", "deal-watchlist") },
    { key: "buy-order-finder", label: "Buy Order Finder", description: "Find active buy orders", icon: <ShoppingBag size={15} />, allowed: marketViewAllowed("buyOrders"), run: () => onNavigate("market", "buy-orders") },
    { key: "craft-calculator", label: "Craft Calculator", description: "Calculate recipe chains", icon: <Calculator size={15} />, allowed: allowedPages.has("craftcalc"), run: () => onNavigate("craftcalc") },
    ...(allowedPages.has("members") ? members : []).map((member) => ({
      key: `member-${member.playerEntityId}`,
      label: memberName(member),
      description: "Open member details",
      icon: <User size={15} />,
      allowed: true,
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
            <button key={command.key} onClick={() => { command.run(); onClose(); }}>
              {command.icon}
              <strong>{command.label}</strong>
              <span>{command.description}</span>
            </button>
          ))}
        </div>
    </Dialog>
  );
}
