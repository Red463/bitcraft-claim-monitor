import { createRoot } from "react-dom/client";
import "./styles/setup-workflow.css";
import "./styles.css";
import "./styles/leaderboard.css";
import "./styles/production.css";
import "./styles/public-craft.css";
import "./styles/inventory.css";
import "./styles/construction.css";
import "./styles/bot-dashboard.css";
import "./styles/empires.css";
import "./styles/app-chrome.css";
import "./styles/user-settings.css";
import "./styles/notifications.css";
import App from "./AppShell";

// Keep this file as the React bootstrapping boundary only. App-level routing,
// settings, auth, and data coordination live in AppShell so future maintainers
// do not have to trace startup behaviour through multiple entrypoints.
createRoot(document.getElementById("root")!).render(<App />);
