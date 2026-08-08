import React from "react";
import { ExternalLink } from "lucide-react";
import "../styles/sync.css";
import { usePageRefresh } from "../refresh/ManualRefreshContext";

const FRAME_TIMEOUT_MS = 12000;
type FrameState = "loading" | "ready" | "timed-out" | "failed";

// The Sync page intentionally embeds an optional external BitCraft Sync board.
// The app does not parse or persist this data; if no URL is configured, routing
// code asks the user to configure one instead of rendering this iframe.
export function SyncPanel({ syncUrl }: { syncUrl: string }) {
  const { cycle, trackPromise } = usePageRefresh();
  const [frameState, setFrameState] = React.useState<FrameState>("loading");
  const [frameAttempt, setFrameAttempt] = React.useState(0);
  const frameCompletion = React.useRef<{ resolve: () => void; reject: (error: Error) => void } | null>(null);
  React.useEffect(() => {
    setFrameState("loading");
    const completion = new Promise<void>((resolve, reject) => { frameCompletion.current = { resolve, reject }; });
    void trackPromise("sync-embed", completion).catch(() => {});
    const timeout = window.setTimeout(() => {
      setFrameState((current) => current === "loading" ? "timed-out" : current);
      frameCompletion.current?.reject(new Error("Sync embed timed out"));
      frameCompletion.current = null;
    }, FRAME_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timeout);
      frameCompletion.current = null;
    };
  }, [cycle?.sequence, frameAttempt, syncUrl, trackPromise]);

  return (
    <div className="panel sync-panel" data-tour="sync-page">
      <header className="members-topbar sync-topbar">
        <div>
          <h2>Sync</h2>
          <p>Embedded BitCraft Sync materials and goals board</p>
        </div>
        <div className="dashboard-top-meta">
          <a className="toolbar-button" href={syncUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open full page</a>
        </div>
      </header>
      <div className={`sync-frame-host is-${frameState}`}>
        <iframe key={`${frameAttempt}:${cycle?.sequence ?? 0}`} className="sync-frame" src={syncUrl} title="BitCraft Sync" onLoad={() => { setFrameState("ready"); frameCompletion.current?.resolve(); frameCompletion.current = null; }} onError={() => { setFrameState("failed"); frameCompletion.current?.reject(new Error("Sync embed failed")); frameCompletion.current = null; }} />
        {frameState !== "ready" ? (
          <section className="sync-frame-state" aria-live="polite">
            <strong>{frameState === "loading" ? "Loading embedded board..." : frameState === "timed-out" ? "The embedded board is taking longer than expected." : "The embedded board could not be loaded."}</strong>
            <span>{frameState === "loading" ? "The board will appear here when the external host responds." : "You can retry the embed or open the full page. This does not affect Claim Monitor data."}</span>
            {frameState !== "loading" ? <div><button className="toolbar-button primary" onClick={() => setFrameAttempt((current) => current + 1)}>Retry</button><a className="toolbar-button" href={syncUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Open full page</a></div> : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
