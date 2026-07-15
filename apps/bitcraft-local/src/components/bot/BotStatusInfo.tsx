import type { ReactNode } from "react";

export type BotStatusTone = "neutral" | "success" | "warning" | "danger";

type BotStatusInfoProps = {
  label: ReactNode;
  content: ReactNode;
  tone?: BotStatusTone;
  role?: "status" | "alert";
};

export function BotStatusInfo({ label, content, tone = "neutral", role }: BotStatusInfoProps) {
  return (
    <div className="info-row bot-status-info" data-tone={tone} role={role}>
      <span>{label}</span>
      <strong>{content ?? "-"}</strong>
    </div>
  );
}
