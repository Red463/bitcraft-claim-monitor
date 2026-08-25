import React from "react";
import { Download, LogIn, LogOut, ShieldCheck, UserRound } from "lucide-react";

import {
  acceptPublicLegal,
  loadPublicLegal,
  loadPublicSession,
  logoutPublicSession,
  reviewPublicDeletion,
  startPublicDiscordLogin,
  startPublicPrivacyReauthentication,
  type PublicLegalPolicy,
  type PublicSession,
} from "./accountApi";

export function PublicAccountSettings({ page }: { page: "account" | "settings" }) {
  const [session, setSession] = React.useState<PublicSession | null>(null);
  const [policy, setPolicy] = React.useState<PublicLegalPolicy | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [acceptedTerms, setAcceptedTerms] = React.useState(false);
  const [ageConfirmed, setAgeConfirmed] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    Promise.all([loadPublicSession(), loadPublicLegal()])
      .then(([nextSession, nextPolicy]) => {
        if (!active) return;
        setSession(nextSession);
        setPolicy(nextPolicy);
      })
      .catch((reason) => { if (active) setMessage(reason instanceof Error ? reason.message : "Account settings are unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function perform(name: string, action: () => Promise<void>) {
    setBusy(name);
    setMessage("");
    try { await action(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "The account request failed."); }
    finally { setBusy(""); }
  }

  async function signIn() {
    await perform("login", async () => {
      const response = await startPublicDiscordLogin({ acceptedTerms, ageConfirmed, returnTo: "/settings" });
      window.location.assign(response.authorizeUrl);
    });
  }

  const csrfToken = session?.csrfToken ?? "";
  const title = page === "account" ? "Account" : "Settings";
  if (loading) return <section className="public-panel public-account-panel" role="status">Loading account settings…</section>;

  return <section className="public-panel public-account-panel">
    <header><div><p className="public-eyebrow">Claim Monitor</p><h1>{title}</h1></div>{session?.user?.avatarUrl ? <img src={session.user.avatarUrl} alt="" /> : <UserRound size={30} />}</header>
    {message ? <p className="public-account-message" role="status">{message}</p> : null}

    {!session?.user ? <div className="public-account-section">
      <h2>Sign in</h2>
      <p>Use a separate Claim Monitor account for saved plans and settings. Discord OAuth requests the identify scope only.</p>
      <label className="public-check"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /> I accept the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</label>
      <label className="public-check"><input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} /> I confirm I am at least {policy?.operator.minimumAge ?? 18} years old.</label>
      <button className="toolbar-button primary" disabled={!session?.discordLoginEnabled || !acceptedTerms || !ageConfirmed || busy === "login"} onClick={() => void signIn()}><LogIn size={16} /> Sign in with Discord</button>
      {!session?.discordLoginEnabled ? <p>Public sign-in is not enabled yet.</p> : null}
    </div> : <>
      <div className="public-account-section">
        <h2>{session.user.globalName || session.user.username}</h2>
        <p>@{session.user.username} · Discord ID {session.user.discordId}</p>
        <div className="public-account-actions">
          <a className="toolbar-button" href="/api/public/auth/privacy/export"><Download size={16} /> Download my data</a>
          <button className="toolbar-button" disabled={!csrfToken || busy === "logout"} onClick={() => void perform("logout", async () => { await logoutPublicSession(csrfToken); setSession({ ...session, user: null, csrfToken: null }); })}><LogOut size={16} /> Sign out</button>
        </div>
      </div>

      {session.legal.requiresAcceptance ? <div className="public-account-section is-warning">
        <h2>Accept the current documents</h2>
        <p>Review the current <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a> before continuing with signed-in features.</p>
        <label className="public-check"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /> I accept the current documents.</label>
        <label className="public-check"><input type="checkbox" checked={ageConfirmed} onChange={(event) => setAgeConfirmed(event.target.checked)} /> I confirm I am at least {policy?.operator.minimumAge ?? 18} years old.</label>
        <button className="toolbar-button primary" disabled={!acceptedTerms || !ageConfirmed || busy === "legal"} onClick={() => void perform("legal", async () => setSession(await acceptPublicLegal(csrfToken)))}><ShieldCheck size={16} /> Accept the current documents</button>
      </div> : null}

      <div className="public-account-section">
        <h2>Privacy &amp; data</h2>
        <p>Download an export at any time. Account-deletion review requires a fresh sign-in with the same Discord account.</p>
        <div className="public-account-actions">
          <button className="toolbar-button" disabled={!csrfToken || busy === "reauth"} onClick={() => void perform("reauth", async () => { const response = await startPublicPrivacyReauthentication(csrfToken); window.location.assign(response.authorizeUrl); })}><ShieldCheck size={16} /> Reauthenticate with Discord</button>
          <button className="toolbar-button danger" disabled={!csrfToken || busy === "delete"} onClick={() => void perform("delete", async () => { const result = await reviewPublicDeletion(csrfToken); if (result.planDispositionReviewRequired) setMessage("Recent sign-in confirmed. Final deletion will remain unavailable until owned plans can be reviewed safely."); })}>Review account deletion</button>
        </div>
        <p>Questions or rights requests: <a href="mailto:privacy@claim-monitor.com">privacy@claim-monitor.com</a>.</p>
      </div>
    </>}
  </section>;
}
