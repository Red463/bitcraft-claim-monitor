import { ExternalLink } from "lucide-react";

// The Sync page intentionally embeds an optional external BitCraft Sync board.
// The app does not parse or persist this data; if no URL is configured, routing
// code asks the user to configure one instead of rendering this iframe.
export function SyncPanel({ syncUrl }: { syncUrl: string }) {
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
      <iframe className="sync-frame" src={syncUrl} title="BitCraft Sync" />
    </div>
  );
}
