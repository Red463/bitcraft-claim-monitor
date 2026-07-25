import React from "react";
import { Download, ExternalLink, MessageCircle, ShieldCheck, X } from "lucide-react";

import { Dialog } from "./Dialog";

export type PublicLegalPolicy = {
  version: string;
  effectiveDate: string;
  operator: {
    controllerName: string;
    projectName: string;
    privacyEmail: string;
    status: string;
    minimumAge: number;
  };
};

type LegalAcceptanceDialogProps = {
  mode: "login" | "existing-session";
  policy: PublicLegalPolicy;
  onContinue: (acceptance: { acceptedTerms: true; ageConfirmed: true }) => Promise<void>;
  onClose: () => void;
  onLogout?: () => Promise<void>;
};

export function LegalAcceptanceDialog({
  mode,
  policy,
  onContinue,
  onClose,
  onLogout,
}: LegalAcceptanceDialogProps) {
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [ageConfirmed, setAgeConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const canContinue = acceptedTerms && ageConfirmed;
  const isExistingSession = mode === "existing-session";

  async function continueWithAcceptance() {
    if (!canContinue || busy) return;
    setBusy(true);
    setError("");
    try {
      await onContinue({ acceptedTerms: true, ageConfirmed: true });
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to record your acceptance");
      setBusy(false);
    }
  }

  async function signOut() {
    if (!onLogout || busy) return;
    setBusy(true);
    setError("");
    try {
      await onLogout();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to sign out");
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={isExistingSession ? "Updated terms require acceptance" : "Review before Discord sign-in"}
      description="Confirm your age and acceptance before continuing."
      closeOnBackdrop={false}
      onClose={isExistingSession ? () => {} : onClose}
      className="legal-acceptance-dialog"
      backdropClassName="legal-acceptance-overlay"
    >
      <header>
        <div>
          <ShieldCheck size={20} />
          <div>
            <h2>{isExistingSession ? "Review updated terms" : "Before you sign in"}</h2>
            <span>{policy.operator.projectName} · Effective {policy.effectiveDate}</span>
          </div>
        </div>
        {!isExistingSession ? <button onClick={onClose} aria-label="Close legal acceptance"><X size={16} /></button> : null}
      </header>

      <div className="legal-acceptance-body">
        <p>{policy.operator.status}</p>
        <p>
          {isExistingSession
            ? "The Terms or Privacy Policy have changed. You must accept the current version before using signed-in features."
            : "Discord will provide your account identity during sign-in so this service can create your account, maintain your session, and provide linked-account features."}
        </p>
        <p>
          Read the complete <a href="/terms" target="_blank" rel="noreferrer">Terms of Service <ExternalLink size={13} /></a>
          {" "}and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy <ExternalLink size={13} /></a>.
          These open in a new tab so your selections here are retained.
        </p>
        <label className="toggle-line legal-acceptance-check">
          <input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} />
          <span>I confirm I am at least 18 years old.</span>
        </label>
        <label className="toggle-line legal-acceptance-check">
          <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} />
          <span>I agree to the Terms of Service and acknowledge the Privacy Policy.</span>
        </label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
      </div>

      <footer className="legal-acceptance-actions">
        <button className="toolbar-button primary" disabled={!canContinue || busy} onClick={() => void continueWithAcceptance()}>
          {mode === "login" ? <MessageCircle size={14} /> : <ShieldCheck size={14} />}
          {busy ? "Please wait…" : mode === "login" ? "Continue with Discord" : "Accept and continue"}
        </button>
        {isExistingSession ? <a className="toolbar-button" href="/api/local/auth/privacy/export"><Download size={14} /> Download my data</a> : null}
        {isExistingSession && onLogout ? <button className="toolbar-button" disabled={busy} onClick={() => void signOut()}>Sign out</button> : null}
        {!isExistingSession ? <button className="toolbar-button" disabled={busy} onClick={onClose}>Cancel</button> : null}
      </footer>
    </Dialog>
  );
}
