import React from "react";

import { loadPublicSession, type PublicSession } from "./accountApi";
import { acceptPublicPlanInvite, loadSharedPublicPlan } from "./planApi";

type Route = { id: "shared-plan" | "invite"; params: Record<string, string> };
type BasicPlan = { id: string; title: string; claimId: string; document: { targets?: unknown[] } };

function BasicPlanState({ plan, prefix }: { plan: BasicPlan; prefix: string }) {
  const targetCount = Array.isArray(plan.document?.targets) ? plan.document.targets.length : 0;
  return <section className="public-panel public-placeholder">
    <p className="public-eyebrow">{prefix}</p>
    <h1>{plan.title}</h1>
    <p>Settlement #{plan.claimId}</p>
    <p>{targetCount} {targetCount === 1 ? "target" : "targets"}</p>
  </section>;
}

function SharedPlan({ planId }: { planId: string }) {
  const [plan, setPlan] = React.useState<BasicPlan | null>(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    const controller = new AbortController();
    loadSharedPublicPlan({
      planId,
      pathname: window.location.pathname,
      sessionStorage: window.sessionStorage,
      signal: controller.signal,
    }).then(setPlan).catch((reason) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "This shared plan is unavailable.");
    });
    return () => controller.abort();
  }, [planId]);

  if (plan) return <BasicPlanState plan={plan} prefix="Shared plan" />;
  if (error) return <section className="public-panel public-placeholder" role="alert"><h1>Shared plan</h1><p>{error}</p></section>;
  return <section className="public-panel public-placeholder" role="status"><h1>Shared plan</h1><p>Loading shared plan…</p></section>;
}

function Invitation({ inviteId }: { inviteId: string }) {
  const [session, setSession] = React.useState<PublicSession | null>(null);
  const [plan, setPlan] = React.useState<BasicPlan | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [accepting, setAccepting] = React.useState(false);
  const [message, setMessage] = React.useState("");

  React.useEffect(() => {
    let active = true;
    loadPublicSession()
      .then((next) => { if (active) setSession(next); })
      .catch(() => { if (active) setMessage("Invitation access is temporarily unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function accept() {
    const csrfToken = session?.csrfToken;
    if (!csrfToken || !session.user || session.legal.requiresAcceptance) return;
    setAccepting(true);
    setMessage("");
    try {
      setPlan(await acceptPublicPlanInvite({
        inviteId,
        pathname: window.location.pathname,
        csrfToken,
        sessionStorage: window.sessionStorage,
      }));
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "This invitation could not be accepted.");
    } finally {
      setAccepting(false);
    }
  }

  if (plan) return <BasicPlanState plan={plan} prefix="Invitation accepted" />;
  if (loading) return <section className="public-panel public-placeholder" role="status"><h1>Plan invitation</h1><p>Checking your public session…</p></section>;
  const signedIn = Boolean(session?.user);
  const legalAccepted = signedIn && !session?.legal.requiresAcceptance;
  return <section className="public-panel public-placeholder">
    <h1>Plan invitation</h1>
    <p>Accepting adds this plan to your Claim Monitor account. Nothing is accepted until you select the button below.</p>
    {message ? <p role="alert">{message}</p> : null}
    {!signedIn ? <p><a href="/settings">Sign in</a> before accepting this invitation.</p> : null}
    {signedIn && !legalAccepted ? <p><a href="/settings">Accept the current Terms and Privacy Policy</a> before continuing.</p> : null}
    <button className="toolbar-button primary" disabled={!signedIn || !legalAccepted || !session?.csrfToken || accepting} onClick={() => void accept()}>
      {accepting ? "Accepting…" : "Accept invitation"}
    </button>
  </section>;
}

export function PublicPlanAccessPage({ route }: { route: Route }) {
  return route.id === "shared-plan"
    ? <SharedPlan planId={route.params.id} />
    : <Invitation inviteId={route.params.id} />;
}
