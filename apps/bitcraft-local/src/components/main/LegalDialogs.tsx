import React from "react";
import { CheckCircle2, CircleHelp, ExternalLink, FileText, MessageCircle, Settings, Shield, X } from "lucide-react";

import packageJson from "../../../package.json";
import { legalPolicyForEnvironment } from "../../legal/legalPolicy.mjs";
import { Dialog } from "./Dialog";
import type { ActivePanel } from "../../types/app";
import { routeHelpFor } from "../../navigation/routeHelp";

const GITHUB_REPOSITORY = "https://github.com/Red463/bitcraft-claim-monitor";
const APP_VERSION = packageJson.version;
const DEFAULT_LEGAL_POLICY = legalPolicyForEnvironment({});
type AnalyticsConsent = "accepted" | "declined" | null;
export function HelpCenter({ activePage, version, onClose, onPrivacy, onTerms, onStartTour }: { activePage: ActivePanel; version: string; onClose: () => void; onPrivacy: () => void; onTerms: () => void; onStartTour: () => void }) {
  const routeHelp = routeHelpFor(activePage);
  return (
    <Dialog open title="Claim Monitor Help" onClose={onClose} className="help-dialog" backdropClassName="help-overlay">
        <header>
          <div>
            <CircleHelp size={19} />
            <h2 id="help-title">Claim Monitor Help</h2>
          </div>
          <button onClick={onClose} aria-label="Close help"><X size={16} /></button>
        </header>
        <div className="beta-notice"><strong>Beta - Work in progress</strong><span>This application is actively being developed. Data display and features may change as accuracy and coverage improve.</span></div>
        <p className="help-intro">Track settlement operations, production opportunities, member professions and skills, storage, regional context, and market history using public BitCraft data.</p>
        {routeHelp ? <section className="terms-section"><h3>On this page</h3><p><strong>{routeHelp.purpose}</strong> {routeHelp.nextAction}</p></section> : null}
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
    </Dialog>
  );
}

function LegalSections({ sections }: { sections: typeof DEFAULT_LEGAL_POLICY.terms.sections }) {
  return (
    <>
      {sections.map((section) => (
        <section className="terms-section" id={section.id} key={section.id}>
          <h3>{section.title}</h3>
          {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.bullets?.length ? <ul>{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </section>
      ))}
    </>
  );
}

function LegalMeta() {
  return (
    <div className="legal-meta" aria-label="Legal document details">
      <strong>{DEFAULT_LEGAL_POLICY.operator.projectName}</strong>
      <span>Version {DEFAULT_LEGAL_POLICY.version} · Effective {DEFAULT_LEGAL_POLICY.effectiveDate}</span>
      <a href={`mailto:${DEFAULT_LEGAL_POLICY.operator.privacyEmail}`}>{DEFAULT_LEGAL_POLICY.operator.privacyEmail}</a>
    </div>
  );
}

function LegalNavigation({ sections }: { sections: typeof DEFAULT_LEGAL_POLICY.terms.sections }) {
  return (
    <nav className="legal-section-nav" aria-label="Document sections">
      <strong>On this page</strong>
      {sections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.title}</a>)}
    </nav>
  );
}

export function TermsContent({ compact = false }: { compact?: boolean }) {
  const content = (
    <>
      {compact ? <LegalMeta /> : null}
      <LegalSections sections={DEFAULT_LEGAL_POLICY.terms.sections} />
      <p className="legal-notice">{DEFAULT_LEGAL_POLICY.notice}</p>
    </>
  );
  return compact ? content : <div className="legal-document-content">{content}</div>;
}

function RetentionTable() {
  return (
    <div className="legal-table-scroll" tabIndex={0} aria-label="Personal data retention table">
      <table className="legal-retention-table">
        <thead><tr><th scope="col">Data</th><th scope="col">Retention</th></tr></thead>
        <tbody>
          {DEFAULT_LEGAL_POLICY.retention.map((rule) => <tr key={rule.key}><th scope="row">{rule.label}</th><td>{rule.rule}</td></tr>)}
        </tbody>
      </table>
    </div>
  );
}

function ProviderList() {
  return (
    <section className="terms-section" id="providers">
      <h3>Named providers</h3>
      <div className="legal-provider-list">
        {DEFAULT_LEGAL_POLICY.providers.map((provider) => (
          <article key={provider.key}>
            <strong>{provider.name}</strong>
            <span>{provider.role}</span>
            <p>{provider.data}</p>
            <small>{provider.location}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PrivacyContent({ compact = false }: { compact?: boolean }) {
  const content = (
    <>
      {compact ? <LegalMeta /> : null}
      <LegalSections sections={DEFAULT_LEGAL_POLICY.privacy.sections} />
      <RetentionTable />
      <ProviderList />
      <p className="legal-notice">{DEFAULT_LEGAL_POLICY.notice}</p>
    </>
  );
  return compact ? content : <div className="legal-document-content">{content}</div>;
}

export function DedicatedLegalPage({ type }: { type: "terms" | "privacy" }) {
  const isTerms = type === "terms";
  const title = isTerms ? DEFAULT_LEGAL_POLICY.terms.title : DEFAULT_LEGAL_POLICY.privacy.title;
  const description = isTerms
    ? "Rules for using Timbersteel Claim Monitor, its Discord features, and connected community tools."
    : "How Timbersteel Claim Monitor collects, uses, protects, retains, and removes personal data.";
  const sections = isTerms ? DEFAULT_LEGAL_POLICY.terms.sections : DEFAULT_LEGAL_POLICY.privacy.sections;
  return (
    <main className="legal-page">
      <article className="legal-document">
        <header className="legal-document-header">
          <div className="legal-document-heading">
            <span className="legal-document-eyebrow">Legal</span>
            <div className="legal-document-title">
              {isTerms ? <FileText size={24} /> : <Shield size={24} />}
              <h1>{title}</h1>
            </div>
            <p>{description}</p>
            <div className="legal-document-meta">
              <span>Version {DEFAULT_LEGAL_POLICY.version}</span>
              <span>Effective {DEFAULT_LEGAL_POLICY.effectiveDate}</span>
            </div>
          </div>
          <a className="toolbar-button" href="/"><ExternalLink size={14} /> Open app</a>
        </header>
        <div className="legal-document-layout">
          <LegalNavigation sections={sections} />
          {isTerms ? <TermsContent /> : <PrivacyContent />}
        </div>
        <footer>
          <span>Questions or privacy requests: <a href={`mailto:${DEFAULT_LEGAL_POLICY.operator.privacyEmail}`}>{DEFAULT_LEGAL_POLICY.operator.privacyEmail}</a>.</span>
          <span>Current game data, completed-sale evidence, and live craft-contribution events are provided by <a href="https://relay.bitcraftsync.app/">BitCraft Relay</a>. Source available on <a href={GITHUB_REPOSITORY}>GitHub</a>.</span>
          <span>Application version {APP_VERSION} · {isTerms ? <a href="/privacy">Read the Privacy Policy</a> : <a href="/terms">Read the Terms of Service</a>}</span>
        </footer>
      </article>
    </main>
  );
}

export function TermsDialog({ onClose, onPrivacy }: { onClose: () => void; onPrivacy: () => void }) {
  return (
    <Dialog open title="Legal & Bot Terms" onClose={onClose} className="help-dialog terms-dialog" backdropClassName="help-overlay">
        <header>
          <div>
            <FileText size={19} />
            <h2 id="terms-title">Terms of Service</h2>
          </div>
          <button onClick={onClose} aria-label="Close legal and bot terms"><X size={16} /></button>
        </header>
        <div className="legal-dialog-scroll"><TermsContent compact /></div>
        <div className="toolbar">
          <a className="toolbar-button primary" href="/terms" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open dedicated page</a>
          <button className="toolbar-button" onClick={() => { onClose(); onPrivacy(); }}><Shield size={14} /> Privacy details</button>
        </div>
    </Dialog>
  );
}

export function PrivacyDialog({ consent, onConsent, onClose }: { consent: AnalyticsConsent; onConsent: (choice: Exclude<AnalyticsConsent, null>) => void; onClose: () => void }) {
  return (
    <Dialog open title="Privacy & Analytics" onClose={onClose} className="help-dialog privacy-dialog" backdropClassName="help-overlay">
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
        <div className="legal-dialog-scroll"><PrivacyContent compact /></div>
        <div className="privacy-actions">
          <button className="toolbar-button primary" onClick={() => onConsent("accepted")}>Accept Analytics</button>
          <button className="toolbar-button" onClick={() => onConsent("declined")}>Decline</button>
          <a className="toolbar-button" href="/privacy" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open dedicated page</a>
        </div>
    </Dialog>
  );
}

export function CookieBanner({ onConsent, onPrivacy }: { onConsent: (choice: Exclude<AnalyticsConsent, null>) => void; onPrivacy: () => void }) {
  return (
    <Dialog open title="Help improve Claim Monitor" closeOnBackdrop={false} onClose={() => {}} className="cookie-banner" backdropClassName="cookie-consent-overlay">
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
    </Dialog>
  );
}

export function DiscordSignInPrompt({ onDiscordLogin, onClose, onSettings }: { onDiscordLogin: () => void; onClose: () => void; onSettings: () => void }) {
  return (
    <Dialog open title="Sign in with Discord" onClose={onClose} className="help-dialog discord-signin-dialog" backdropClassName="help-overlay discord-signin-overlay">
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
          <button className="toolbar-button primary" onClick={onDiscordLogin}><MessageCircle size={14} /> Sign in with Discord</button>
          <button className="toolbar-button" onClick={onSettings}><Settings size={14} /> Open settings</button>
          <button className="toolbar-button" onClick={onClose}>Maybe later</button>
        </div>
    </Dialog>
  );
}
