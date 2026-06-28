import { createRoot } from "react-dom/client";
import "./styles/phase6.css";
import "./styles.css";
import "./styles/app-chrome.css";
import "./styles/user-settings.css";
import "./styles/notifications.css";
import App from "./AppShell";

// Keep this file as the React bootstrapping boundary only. App-level routing,
// settings, auth, and data coordination live in AppShell so future maintainers
// do not have to trace startup behaviour through multiple entrypoints.
createRoot(document.getElementById("root")!).render(<App />);
