import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { Dialog } from "../main/Dialog";
import type { AdminActionConfirmation } from "./adminActionConfirmation";

export function ConfirmAdminActionDialog({ confirmation, onClose }: {
  confirmation: AdminActionConfirmation | null;
  onClose: () => void;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  if (!confirmation) return null;
  return (
    <Dialog
      open
      title={confirmation.title}
      description={confirmation.impact}
      onClose={onClose}
      initialFocusRef={cancelRef}
      className="admin-modal admin-confirm-action-dialog"
      backdropClassName="admin-modal-backdrop"
    >
      <header>
        <div><AlertTriangle size={20} /><div><h2>{confirmation.title}</h2><p>{confirmation.target}</p></div></div>
        <button className="icon-button" type="button" aria-label="Close confirmation" title="Close" onClick={onClose}><X size={17} /></button>
      </header>
      <div className="admin-confirm-impact">
        <strong>Impact</strong>
        <p>{confirmation.impact}</p>
        <span><strong>Reversible:</strong> {confirmation.reversible ? "Yes" : "No"}</span>
      </div>
      <div className="modal-actions">
        <button ref={cancelRef} className="toolbar-button" type="button" onClick={onClose}>Cancel</button>
        <button className={`toolbar-button ${confirmation.tone}`} type="button" onClick={() => { const action = confirmation.onConfirm; onClose(); void action(); }}>{confirmation.confirmLabel}</button>
      </div>
    </Dialog>
  );
}
