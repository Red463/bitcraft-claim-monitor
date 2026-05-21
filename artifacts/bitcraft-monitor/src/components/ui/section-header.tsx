import * as React from "react";

interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between pb-5 mb-6 border-b border-border/40">
      <div className="flex items-start gap-3">
        <div className="w-px h-8 bg-gradient-to-b from-primary/70 to-transparent rounded-full mt-0.5 shrink-0" />
        <div>
          <h2 className="text-xl font-serif text-primary tracking-wide">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-1 font-sans">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
