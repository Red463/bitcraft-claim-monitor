import * as React from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
  warning?: boolean;
}

export function StatCard({ title, value, icon, warning }: StatCardProps) {
  return (
    <div className={cn(
      "relative p-4 border rounded-lg bg-card flex flex-col gap-2.5 overflow-hidden",
      warning ? "border-destructive/40" : "border-border",
    )}>
      <div className={cn(
        "absolute top-0 left-0 right-0 h-px",
        warning
          ? "bg-gradient-to-r from-transparent via-destructive/50 to-transparent"
          : "bg-gradient-to-r from-transparent via-primary/25 to-transparent"
      )} />

      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">{title}</span>
        {icon && (
          <span className={cn("opacity-50", warning ? "text-destructive" : "text-primary")}>
            {icon}
          </span>
        )}
      </div>

      <div className={cn(
        "text-[1.65rem] font-serif font-semibold tracking-tight leading-none",
        warning ? "text-destructive" : "text-foreground"
      )}>
        {value}
      </div>
    </div>
  );
}
