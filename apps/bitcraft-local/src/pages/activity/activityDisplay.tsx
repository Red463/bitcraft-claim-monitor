import React from "react";
import { Activity, Box, Building2, CircleDollarSign, Package, ShoppingCart, Users } from "lucide-react";

import type { AnyRecord } from "../../main-app-data";

export function activityStyle(item: AnyRecord): { label: string; tone: string; icon: React.ReactNode } {
  const eventType = String(item.event_type ?? "");
  if (eventType.includes("market")) return { label: "Market", tone: "market", icon: <ShoppingCart size={18} /> };
  switch (eventType) {
    case "storage": return { label: "Storage", tone: "storage", icon: <Box size={18} /> };
    case "treasury": return { label: "Treasury", tone: "treasury", icon: <CircleDollarSign size={18} /> };
    case "supplies": return { label: "Supplies", tone: "supplies", icon: <Package size={18} /> };
    case "members": return { label: "Members", tone: "members", icon: <Users size={18} /> };
    case "buildings": return { label: "Structures", tone: "buildings", icon: <Building2 size={18} /> };
    default: return { label: "Update", tone: "default", icon: <Activity size={18} /> };
  }
}
