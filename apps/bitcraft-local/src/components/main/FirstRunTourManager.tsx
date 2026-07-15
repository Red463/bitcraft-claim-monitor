import React from "react";
import { Compass, X } from "lucide-react";
import type { ActivePanel } from "../../types/app";
import { usePersistedState } from "../../hooks/usePersistedState";
import { Dialog } from "./Dialog";
import {
  FIRST_RUN_TOUR_SEEN_KEY,
  FIRST_RUN_TOUR_STEPS,
  firstRunTourSeenAfterAction,
  shouldShowFirstRunTourPrompt,
  tourTargetRect,
  type FirstRunTourAction,
  type FirstRunTourStep,
} from "../../tour/firstRunTour";

type FirstRunTourManagerProps = {
  activePage: ActivePanel;
  enabled: boolean;
  showAccountStep: boolean;
  replayToken: number;
  onNavigate: (panel: ActivePanel) => void;
  onOpenUserSettings?: () => void;
  onCloseUserSettings?: () => void;
  onVisibilityChange?: (visible: boolean) => void;
};

function cardStyle(step: FirstRunTourStep, rect: ReturnType<typeof tourTargetRect>): React.CSSProperties {
  if (!rect || step.placement === "center") return {};
  const gap = step.target === "floating-actions" ? 30 : 14;
  const width = Math.min(340, Math.max(280, window.innerWidth - 36));
  const centeredLeft = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 18), window.innerWidth - width - 18);
  if (step.placement === "top") return { left: centeredLeft, top: Math.max(18, rect.top - 190) };
  if (step.placement === "bottom") return { left: centeredLeft, top: Math.min(window.innerHeight - 210, rect.bottom + gap) };
  if (step.placement === "left") return { left: Math.max(18, rect.left - width - gap), top: Math.min(Math.max(18, rect.top), window.innerHeight - 230) };
  return { left: Math.min(window.innerWidth - width - 18, rect.right + gap), top: Math.min(Math.max(18, rect.top), window.innerHeight - 230) };
}

function spotlightStyle(rect: ReturnType<typeof tourTargetRect>): React.CSSProperties {
  if (!rect) return {};
  return {
    left: Math.max(8, rect.left - 8),
    top: Math.max(8, rect.top - 8),
    width: rect.width + 16,
    height: rect.height + 16,
  };
}

export function FirstRunTourManager({ activePage, enabled, showAccountStep, replayToken, onNavigate, onVisibilityChange }: FirstRunTourManagerProps) {
  const [seen, setSeen] = usePersistedState(FIRST_RUN_TOUR_SEEN_KEY, false);
  const [promptOpen, setPromptOpen] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [targetRect, setTargetRect] = React.useState<ReturnType<typeof tourTargetRect>>(null);

  const blocked = !enabled;
  const steps = FIRST_RUN_TOUR_STEPS.filter((candidate) => showAccountStep || candidate.id !== "account-access");
  const step = steps[stepIndex] ?? steps[0];
  const visible = promptOpen || running;

  React.useEffect(() => {
    if (shouldShowFirstRunTourPrompt({ seen, blocked, active: promptOpen || running })) setPromptOpen(true);
  }, [blocked, promptOpen, running, seen]);

  React.useEffect(() => {
    if (replayToken <= 0 || !enabled) return;
    setSeen(true);
    setPromptOpen(false);
    setStepIndex(0);
    setRunning(true);
  }, [enabled, replayToken, setSeen]);

  React.useEffect(() => {
    onVisibilityChange?.(visible);
  }, [onVisibilityChange, visible]);

  React.useEffect(() => {
    if (!running || !step) return;
    if (activePage !== step.page) onNavigate(step.page);
  }, [activePage, onNavigate, running, step]);

  React.useEffect(() => {
    if (!running || !step) return;
    setTargetRect(null);
    function updateTargetRect() {
      const nextRect = tourTargetRect(document, step);
      setTargetRect(nextRect);
    }
    const timeout = window.setTimeout(updateTargetRect, activePage === step.page ? 40 : 180);
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [activePage, running, step]);

  function markSeen(action: FirstRunTourAction) {
    if (firstRunTourSeenAfterAction(action)) setSeen(true);
  }

  function decline() {
    markSeen("decline");
    setPromptOpen(false);
  }

  function start() {
    markSeen("start");
    setPromptOpen(false);
    setStepIndex(0);
    setRunning(true);
  }

  function close(action: "skip" | "close" | "complete") {
    markSeen(action);
    setPromptOpen(false);
    setRunning(false);
  }

  function next() {
    if (stepIndex >= steps.length - 1) {
      close("complete");
      return;
    }
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  if (!enabled) return null;

  if (promptOpen) {
    return (
      <Dialog open title="Welcome to Claim Monitor" closeOnBackdrop={false} onClose={decline} className="first-run-tour-prompt" backdropClassName="first-run-tour-overlay first-run-tour-prompt-overlay">
          <div className="first-run-tour-icon" aria-hidden="true"><Compass size={22} /></div>
          <div>
            <h2 id="first-run-tour-prompt-title">Welcome to Claim Monitor</h2>
            <p>Claim Monitor helps your settlement keep track of production, members, markets, inventory, construction, research, empire activity, and map information in one place.</p>
            <p>Take a short tour to find what needs attention, jump to a task, and know where to get help.</p>
          </div>
          <div className="first-run-tour-actions">
            <button className="toolbar-button" onClick={decline}>No thanks</button>
            <button className="toolbar-button primary" onClick={start}>Start tour</button>
          </div>
      </Dialog>
    );
  }

  if (!running || !step) return null;

  const hasTarget = Boolean(targetRect);
  const centerCard = hasTarget && step.placement === "center";
  return (
    <>
      {hasTarget ? <div className="first-run-tour-overlay first-run-tour-spotlight-layer" aria-hidden="true"><div className="first-run-tour-spotlight" style={spotlightStyle(targetRect)} /></div> : null}
      <Dialog
        open
        title={step.title}
        description={step.body}
        modal={false}
        closeOnBackdrop={false}
        autoFocus={false}
        onClose={() => close("close")}
        className="first-run-tour-card"
        backdropClassName={`first-run-tour-overlay ${!hasTarget ? "is-centered" : centerCard ? "is-card-centered" : ""}`}
        style={centerCard ? undefined : cardStyle(step, targetRect)}
      >
        <header>
          <span>{stepIndex + 1} of {steps.length}</span>
          <button type="button" onClick={() => close("close")} aria-label="Close app tour"><X size={16} /></button>
        </header>
        <h2 id="first-run-tour-title">{step.title}</h2>
        <p>{step.body}</p>
        {!hasTarget ? <small>Open the page and this step will highlight the matching tool when it is available.</small> : null}
        <div className="first-run-tour-actions">
          <button className="toolbar-button" onClick={() => close("skip")}>Skip tour</button>
          <button className="toolbar-button" disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(0, current - 1))}>Back</button>
          <button className="toolbar-button primary" onClick={next}>{stepIndex >= steps.length - 1 ? "Finish" : "Next"}</button>
        </div>
      </Dialog>
    </>
  );
}
