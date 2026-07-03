import React from "react";
import { CheckCircle2, CircleHelp, ExternalLink, FileText, MessageCircle, Settings, Shield, X } from "lucide-react";

import packageJson from "../../../package.json";

const GITHUB_REPOSITORY = "https://github.com/Red463/bitcraft-claim-monitor";
const APP_VERSION = packageJson.version;
type AnalyticsConsent = "accepted" | "declined" | null;
export function HelpCenter({ version, onClose, onPrivacy, onTerms, onStartTour }: { version: string; onClose: () => void; onPrivacy: () => void; onTerms: () => void; onStartTour: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <CircleHelp size={19} />
            <h2 id="help-title">Claim Monitor Help</h2>
          </div>
          <button onClick={onClose} aria-label="Close help"><X size={16} /></button>
        </header>
        <div className="beta-notice"><strong>Beta - Work in progress</strong><span>This application is actively being developed. Data display and features may change as accuracy and coverage improve.</span></div>
        <p className="help-intro">Track settlement operations, production opportunities, member professions and skills, storage, regional context, and market history using public BitCraft data.</p>
        <div className="help-links">
          <a href={`${GITHUB_REPOSITORY}#readme`} target="_blank" rel="noreferrer">
            <strong>Application Guide</strong>
            <span>Read the full feature and deployment overview</span>
            <ExternalLink size={14} />
          </a>
          <a href={`${GITHUB_REPOSITORY}/blob/main/CHANGELOG.md`} target="_blank" rel="noreferrer">
            <strong>Version {version}</strong>
            <span>View the latest changes and release notes</span>
            <ExternalLink size={14} />
          </a>
          <a href={`${GITHUB_REPOSITORY}/issues`} target="_blank" rel="noreferrer">
            <strong>Report Bugs & Request Features</strong>
            <span>Found an issue or have an idea? Let us know on GitHub Issues.</span>
            <ExternalLink size={14} />
          </a>
          <button className="help-link-button" onClick={() => { onClose(); onStartTour(); }}>
            <strong>Start app tour</strong>
            <span>Replay the guided overview of the main dashboard tools</span>
            <CircleHelp size={14} />
          </button>
          <button className="help-link-button" onClick={() => { onClose(); onPrivacy(); }}>
            <strong>Privacy & Analytics</strong>
            <span>See what anonymous usage data may be measured</span>
            <Shield size={14} />
          </button>
          <button className="help-link-button" onClick={() => { onClose(); onTerms(); }}>
            <strong>Legal & Bot Terms</strong>
            <span>Read usage terms for the site and Discord bot</span>
            <FileText size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

export function TermsContent({ compact = false }: { compact?: boolean }) {
  return (
    <>
      <section className="terms-section">
        <h3>Application Terms</h3>
        <p>This is an unofficial fan-made settlement tool for BitCraft players. It is provided as-is for community use, testing and development. Data may be delayed, incomplete, unavailable or inaccurate, so do not rely on it as the only source for important settlement decisions.</p>
        <p>The app is not affiliated with Clockwork Labs. BitCraft&trade; is a trademark of Clockwork Labs, Inc. Data is provided by the BitJita API.</p>
      </section>
      <section className="terms-section">
        <h3>Discord Bot Terms</h3>
        <p>The optional Timbersteel Trade Discord bot posts settlement notifications and responds to slash commands using the same public BitJita data and locally stored app data used by this dashboard.</p>
        <p>Using the bot in Discord means command names, command options, Discord user/server/channel identifiers, response status, and notification delivery diagnostics may be processed by this app and Discord to provide the requested bot features.</p>
        <p>Bot responses are informational only. Server administrators can disable notifications, remove the bot, rotate its token, or delete local diagnostic/history data from the app administration tools.</p>
      </section>
      {!compact ? <p className="help-intro">Questions, bug reports and feature requests can be raised through the GitHub Issues link in this app.</p> : null}
    </>
  );
}

export function PrivacyContent() {
  return (
    <>
      <p className="help-intro">With your permission, this site uses first-party analytics cookies to understand which pages and tools are valuable and how long sections are used. This information is genuinely helpful while the app is being developed.</p>
      <p className="help-intro">Analytics record a random browser identifier, visits to app sections and high-level feature actions. They do not record BitCraft usernames, selected member identities, typed search text, admin credentials or database contents.</p>
      <p className="help-intro">The optional Discord bot does not use analytics cookies. When enabled, Discord slash commands and notifications may process Discord server, channel and user identifiers, command options, public BitJita data, and notification delivery diagnostics so the bot can respond and administrators can diagnose delivery issues.</p>
      <p className="help-intro">Consent and analytics cookies last for up to 180 days. Raw usage events are retained for up to 90 days. You can change your preference in the app at any time; declining removes the analytics identifier from this browser.</p>
    </>
  );
}

export function DedicatedLegalPage({ type }: { type: "terms" | "privacy" }) {
  const isTerms = type === "terms";
  return (
    <main className="legal-page">
      <section className="legal-document">
        <header>
          <div>
            {isTerms ? <FileText size={22} /> : <Shield size={22} />}
            <h1>{isTerms ? "Terms & Discord Bot Use" : "Privacy Policy"}</h1>
          </div>
          <a className="toolbar-button" href="/"><ExternalLink size={14} /> Open app</a>
        </header>
        <p className="help-intro">Timbersteel Claim Monitor - version {APP_VERSION}</p>
        {isTerms ? <TermsContent /> : <PrivacyContent />}
        <footer>
          <span>Unofficial fan-made tool. Not affiliated with Clockwork Labs. BitCraft&trade; is a trademark of Clockwork Labs, Inc.</span>
          <span>Data provided by the <a href="https://bitjita.com/docs/api">BitJita API</a>. Source available on <a href={GITHUB_REPOSITORY}>GitHub</a>.</span>
        </footer>
      </section>
    </main>
  );
}

export function TermsDialog({ onClose, onPrivacy }: { onClose: () => void; onPrivacy: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog terms-dialog" role="dialog" aria-modal="true" aria-labelledby="terms-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <FileText size={19} />
            <h2 id="terms-title">Legal & Bot Terms</h2>
          </div>
          <button onClick={onClose} aria-label="Close legal and bot terms"><X size={16} /></button>
        </header>
        <TermsContent compact />
        <div className="toolbar">
          <a className="toolbar-button primary" href="/terms" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open dedicated page</a>
          <button className="toolbar-button" onClick={() => { onClose(); onPrivacy(); }}><Shield size={14} /> Privacy details</button>
        </div>
      </section>
    </div>
  );
}

export function PrivacyDialog({ consent, onConsent, onClose }: { consent: AnalyticsConsent; onConsent: (choice: Exclude<AnalyticsConsent, null>) => void; onClose: () => void }) {
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose}>
      <section className="help-dialog privacy-dialog" role="dialog" aria-modal="true" aria-labelledby="privacy-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <Shield size={19} />
            <h2 id="privacy-title">Privacy & Analytics</h2>
          </div>
          <button onClick={onClose} aria-label="Close privacy information"><X size={16} /></button>
        </header>
        <div className={`analytics-status ${consent === "accepted" ? "enabled" : ""}`}>
          <strong>Usage analytics {consent === "accepted" ? "accepted" : consent === "declined" ? "declined" : "not selected"}</strong>
          <span>{consent === "accepted" ? "This browser is helping development by sharing anonymous feature usage." : "This browser is not currently contributing usage analytics."}</span>
        </div>
        <PrivacyContent />
        <div className="privacy-actions">
          <button className="toolbar-button primary" onClick={() => onConsent("accepted")}>Accept Analytics</button>
          <button className="toolbar-button" onClick={() => onConsent("declined")}>Decline</button>
          <a className="toolbar-button" href="/privacy" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open dedicated page</a>
        </div>
      </section>
    </div>
  );
}

export function CookieBanner({ onConsent, onPrivacy }: { onConsent: (choice: Exclude<AnalyticsConsent, null>) => void; onPrivacy: () => void }) {
  return (
    <div className="cookie-consent-overlay" role="presentation">
      <section className="cookie-banner" role="dialog" aria-modal="true" aria-labelledby="cookie-consent-title">
        <div>
          <strong id="cookie-consent-title">Help improve Claim Monitor</strong>
          <p>We use optional anonymous analytics to understand which pages, tools, and features are used most. This helps prioritise development and improve the app without collecting your name, Discord account, character identity, or personal messages.</p>
          <p className="cookie-note">Please choose whether this browser can share anonymous feature-usage data. You can change this later from Privacy & Analytics.</p>
          <button className="cookie-details" onClick={onPrivacy}>Privacy & Analytics details</button>
        </div>
        <div className="cookie-actions">
          <button className="toolbar-button primary" onClick={() => onConsent("accepted")}>Accept Anonymous Analytics</button>
          <button className="toolbar-button" onClick={() => onConsent("declined")}>Decline</button>
        </div>
      </section>
    </div>
  );
}

export function DiscordSignInPrompt({ authHref, onDiscordLogin, onClose, onSettings }: { authHref: string; onDiscordLogin: () => void; onClose: () => void; onSettings: () => void }) {
  return (
    <div className="help-overlay discord-signin-overlay" onClick={onClose}>
      <section className="help-dialog discord-signin-dialog" role="dialog" aria-modal="true" aria-labelledby="discord-signin-title" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <MessageCircle size={19} />
            <h2 id="discord-signin-title">Sign in with Discord</h2>
          </div>
          <button onClick={onClose} aria-label="Close Discord sign-in prompt"><X size={16} /></button>
        </header>
        <div className="discord-signin-body">
          <strong>Keep your preferences with you.</strong>
          <p>Discord sign-in lets you link your BitCraft character for approval and save your app settings on this server instead of only in this browser.</p>
          <ul>
            <li><CheckCircle2 size={14} /> Request a verified character link.</li>
            <li><CheckCircle2 size={14} /> Restore saved settings after changing browser or device.</li>
            <li><CheckCircle2 size={14} /> Local browsing still works if you skip this.</li>
          </ul>
        </div>
        <div className="help-actions">
          <a className="toolbar-button primary" href={authHref} onClick={onDiscordLogin}><MessageCircle size={14} /> Sign in with Discord</a>
          <button className="toolbar-button" onClick={onSettings}><Settings size={14} /> Open settings</button>
          <button className="toolbar-button" onClick={onClose}>Maybe later</button>
        </div>
      </section>
    </div>
  );
}
