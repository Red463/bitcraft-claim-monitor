import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Shield, Users, Map as MapIcon, Globe, Home, Package, Hammer, FlaskConical, CircleDollarSign, Activity, Swords, Factory } from "lucide-react";

import { OverviewPanel } from "@/components/panels/overview";
import { MembersPanel } from "@/components/panels/members";
import { MapPanel } from "@/components/panels/map";
import { RegionPanel } from "@/components/panels/empire";
import { BuildingsPanel } from "@/components/panels/buildings";
import { InventoryPanel } from "@/components/panels/inventory";
import { ConstructionPanel } from "@/components/panels/construction";
import { ResearchPanel } from "@/components/panels/research";
import { MarketPanel } from "@/components/panels/market";
import { ActivityPanel } from "@/components/panels/activity";
import { SkillsPanel } from "@/components/panels/skills";
import { ProductionPanel } from "@/components/panels/production";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      retry: 2,
    },
  },
});

const NAV_GROUPS = [
  {
    items: [
      { id: "overview",     label: "Overview",     icon: Shield },
    ],
  },
  {
    label: "People",
    items: [
      { id: "members",      label: "Members",      icon: Users },
      { id: "skills",       label: "Skills",       icon: Swords },
    ],
  },
  {
    label: "Settlement",
    items: [
      { id: "production",   label: "Production",   icon: Factory },
      { id: "inventory",    label: "Inventory",    icon: Package },
      { id: "construction", label: "Construction", icon: Hammer },
      { id: "buildings",    label: "Buildings",    icon: Home },
    ],
  },
  {
    label: "Economy",
    items: [
      { id: "research",     label: "Research",     icon: FlaskConical },
      { id: "market",       label: "Market",       icon: CircleDollarSign },
    ],
  },
  {
    label: "World",
    items: [
      { id: "empire",       label: "Region",       icon: Globe },
      { id: "map",          label: "Map",          icon: MapIcon },
    ],
  },
  {
    label: "Tracking",
    items: [
      { id: "activity",     label: "Activity",     icon: Activity },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);

function Dashboard() {
  const [activePanel, setActivePanel] = useState("overview");

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 border-r border-sidebar-border bg-sidebar shrink-0 flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border gap-3">
          <div className="w-6 h-6 rounded border border-primary/40 bg-primary/10 flex items-center justify-center shrink-0">
            <Shield className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h1 className="font-serif text-sm font-bold text-primary tracking-[0.12em] uppercase leading-none">
              Claim Monitor
            </h1>
            <p className="text-[9px] text-muted-foreground/50 tracking-widest uppercase mt-0.5">Timbersteel</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-4">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi}>
              {group.label && (
                <p className="px-2 mb-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
                  {group.label}
                </p>
              )}
              <div className="space-y-px">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activePanel === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActivePanel(item.id)}
                      data-testid={`nav-${item.id}`}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all relative overflow-hidden ${
                        isActive
                          ? "bg-primary/10 text-primary font-medium"
                          : "text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground font-normal"
                      }`}
                    >
                      {isActive && (
                        <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-primary rounded-r-full" />
                      )}
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/40"}`} />
                      <span className="text-[13px]">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-sidebar-border">
          <p className="text-[9px] text-muted-foreground/30 tracking-wider uppercase">
            Powered by Bitjita API
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 min-h-0 ${activePanel === "map" ? "flex flex-col overflow-hidden" : "overflow-y-auto"}`}>
        <main className={activePanel === "map" ? "flex-1 flex flex-col min-h-0" : ""}>
          {activePanel === "overview"     && <OverviewPanel />}
          {activePanel === "members"      && <MembersPanel />}
          {activePanel === "map"          && <MapPanel />}
          {activePanel === "empire"       && <RegionPanel />}
          {activePanel === "buildings"    && <BuildingsPanel />}
          {activePanel === "inventory"    && <InventoryPanel />}
          {activePanel === "construction" && <ConstructionPanel />}
          {activePanel === "research"     && <ResearchPanel />}
          {activePanel === "market"       && <MarketPanel />}
          {activePanel === "activity"     && <ActivityPanel />}
          {activePanel === "skills"       && <SkillsPanel />}
          {activePanel === "production"   && <ProductionPanel />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
