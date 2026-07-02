import React from "react";
import { Bell, Calculator, CircleDollarSign, Search, ShoppingBag, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ActivePanel } from "../../types/app";
import type { AnyRecord } from "../../main-app-data";

type NavItem = readonly [ActivePanel, string, LucideIcon];

function memberName(member: AnyRecord): string {
  return String(member.userName ?? member.username ?? "Member");
}

export function CommandPalette({
  navItems,
  members,
  onClose,
  onNavigate,
  onSelectMember,
}: {
  navItems: readonly NavItem[];
  members: AnyRecord[];
  onClose: () => void;
  onNavigate: (panel: ActivePanel, marketTab?: string) => void;
  onSelectMember: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.toLowerCase().trim();
  const commands = [
    ...navItems.map(([id, label, Icon]) => ({ key: `page-${id}`, label, description: "Open page", icon: <Icon size={15} />, run: () => onNavigate(id) })),
    { key: "price-finder", label: "Price Finder", description: "Find a listing price", icon: <CircleDollarSign size={15} />, run: () => onNavigate("market", "pricing") },
    { key: "deal-watchlist", label: "Deal Watchlist", description: "Manage watched market deals", icon: <Bell size={15} />, run: () => onNavigate("market", "deal-watchlist") },
    { key: "buy-order-finder", label: "Buy Order Finder", description: "Find active buy orders", icon: <ShoppingBag size={15} />, run: () => onNavigate("market", "buy-orders") },
    { key: "craft-calculator", label: "Craft Calculator", description: "Calculate recipe chains", icon: <Calculator size={15} />, run: () => onNavigate("craftcalc") },
    ...members.map((member) => ({
      key: `member-${member.playerEntityId}`,
      label: memberName(member),
      description: "Open member details",
      icon: <User size={15} />,
      run: () => {
        onSelectMember(String(member.playerEntityId));
        onNavigate("members");
      },
    })),
  ].filter((command) => !q || `${command.label} ${command.description}`.toLowerCase().includes(q)).slice(0, 12);

  React.useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);

  return (
    <div className="command-overlay" onClick={onClose}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-label="Quick navigation" onClick={(event) => event.stopPropagation()}>
        <label>
          <Search size={17} />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Navigate or find a member..." />
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
      </section>
    </div>
  );
}
