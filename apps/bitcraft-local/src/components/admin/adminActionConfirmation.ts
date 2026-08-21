export type AdminActionConfirmation = {
  title: string;
  target: string;
  impact: string;
  reversible: boolean;
  confirmLabel: string;
  tone: "danger" | "warning";
  onConfirm: () => void | Promise<void>;
};

export function validateAdminActionConfirmation(value: AdminActionConfirmation): boolean {
  return Boolean(value.title.trim() && value.target.trim() && value.impact.trim() && value.confirmLabel.trim() && typeof value.reversible === "boolean" && typeof value.onConfirm === "function");
}
