import { AlertTriangle } from "lucide-react";

interface WarningCardProps {
  title: string;
  message: string;
}

export function WarningCard({ title, message }: WarningCardProps) {
  return (
    <div className="flex items-start gap-3 p-4 bg-destructive/8 border border-destructive/25 rounded-lg text-destructive-foreground">
      <div className="w-8 h-8 rounded-md bg-destructive/15 flex items-center justify-center shrink-0 mt-0.5">
        <AlertTriangle className="w-4 h-4 text-destructive" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-destructive">{title}</h4>
        <p className="text-xs text-destructive/70 mt-1 leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
