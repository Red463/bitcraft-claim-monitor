import React from "react";
import { Bell, Calculator, CircleDollarSign, LockKeyhole, Search, ShoppingBag, User } from "lucide-react";
import type { AnyRecord } from "../../main-app-data";
import { NAV } from "../../navigation";
import { activatePagePaletteCommand, buildPagePaletteCommands, visiblePagePaletteItems } from "../../navigation/paletteCommands";
import type { ActivePanel } from "../../types/app";
import { effectiveTargetAllowed, targetIdForPage, targetIdForTab, type EffectiveAccess } from "../../access/accessControl.mjs";
import { Dialog } from "./Dialog";

function memberName(member: AnyRecord): string {
  return String(member.userName ?? member.username ?? "Member");
}

export function CommandPalette({
  adminAuthenticated,
  access,
  members,
  onClose,
  onNavigate,
  onSelectMember,
}: {
  adminAuthenticated: boolean;
  access?: EffectiveAccess | null;
  members: AnyRecord[];
  onClose: () => void;
  onNavigate: (panel: ActivePanel, marketTab?: string) => void;
  onSelectMember: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const q = query.toLowerCase().trim();
  const pageItems = visiblePagePaletteItems(NAV, adminAuthenticated);
  const allowedPages = new Set<ActivePanel>(pageItems
    .filter(([id]) => id === "admin" || effectiveTargetAllowed(access, targetIdForPage(id)))
    .map(([id]) => id));
  const marketViewAllowed = (tab: "browse" | "deal-watch" | "buy-orders") => allowedPages.has("market") && effectiveTargetAllowed(access, targetIdForTab("market", tab));
  const commands = [
    ...buildPagePaletteCommands(pageItems, allowedPages).map((command) => {
      const Icon = command.icon;
      return {
        ...command,
        icon: command.locked ? <LockKeyhole size={15} /> : <Icon size={15} />,
        allowed: true,
        run: () => activatePagePaletteCommand(command, onNavigate),
      };
    }),
    { key: "price-finder", label: "Market Browse", description: "Find global listings and price history", icon: <CircleDollarSign size={15} />, allowed: marketViewAllowed("browse"), locked: false, run: () => onNavigate("market", "browse") },
    { key: "market-saved", label: "Market Saved", description: "Manage favorite items and deal alerts", icon: <Bell size={15} />, allowed: marketViewAllowed("deal-watch"), locked: false, run: () => onNavigate("market", "saved") },
    { key: "market-opportunities", label: "Market Opportunities", description: "Find arbitrage routes and active global demand", icon: <ShoppingBag size={15} />, allowed: marketViewAllowed("buy-orders"), locked: false, run: () => onNavigate("market", "opportunities") },
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
            <button key={command.key} data-restricted={command.locked || undefined} onClick={() => { if (command.run() !== false) onClose(); }}>
              {command.icon}
              <strong>{command.label}</strong>
              <span>{command.description}</span>
            </button>
          ))}
        </div>
    </Dialog>
  );
}
