import React from "react";

type JsonRecord = Record<string, any>;
type AdminRequest = (path: string, options?: RequestInit) => Promise<JsonRecord>;

type OwnedPlanReview = {
  id: string;
  title: string;
  acceptedEditors?: Array<{ userId: number; username?: string; globalName?: string }>;
};

type PlanDisposition = { action: "delete" | "transfer"; userId?: number };

export type AdminPublicServiceSectionProps = {
  data?: JsonRecord | null;
  pending?: boolean;
  error?: string | null;
  canInspect: boolean;
  canModerate: boolean;
  canRestore: boolean;
  canProcessPrivacy: boolean;
  onRequest: AdminRequest;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Public service request failed.";
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><span className="legend">{label}</span><strong>{value}</strong></div>;
}

function SafeRecord({ value, empty }: { value: unknown; empty: string }) {
  if (!value) return <p className="legend">{empty}</p>;
  return <pre className="discord-tool-result public-admin-record">{JSON.stringify(value, null, 2)}</pre>;
}

export function PublicServiceAdminSection({
  data = null,
  pending = false,
  error = null,
  canInspect,
  canModerate,
  canRestore,
  canProcessPrivacy,
  onRequest,
}: AdminPublicServiceSectionProps) {
  const [health, setHealth] = React.useState<JsonRecord | null>(data);
  const [accountId, setAccountId] = React.useState("");
  const [discordId, setDiscordId] = React.useState("");
  const [planId, setPlanId] = React.useState("");
  const [inviteId, setInviteId] = React.useState("");
  const [shareId, setShareId] = React.useState("");
  const [account, setAccount] = React.useState<JsonRecord | null>(null);
  const [plan, setPlan] = React.useState<JsonRecord | null>(null);
  const [privacyReview, setPrivacyReview] = React.useState<JsonRecord | null>(null);
  const [dispositions, setDispositions] = React.useState<Record<string, PlanDisposition>>({});
  const [busy, setBusy] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(error);

  const run = React.useCallback(async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setMessage(null);
    try {
      await action();
    } catch (requestError) {
      setMessage(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }, [busy]);

  const refreshHealth = React.useCallback(() => run("health", async () => {
    setHealth(await onRequest("/admin/public-service/health"));
  }), [onRequest, run]);

  React.useEffect(() => {
    let active = true;
    setBusy("health");
    void onRequest("/admin/public-service/health")
      .then((result) => { if (active) setHealth(result); })
      .catch((requestError) => { if (active) setMessage(errorMessage(requestError)); })
      .finally(() => { if (active) setBusy(""); });
    return () => { active = false; };
  // AdminPanel owns this request function, so mount is the stable load boundary.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookupAccount = () => run("account-lookup", async () => {
    const query = accountId.trim()
      ? `accountId=${encodeURIComponent(accountId.trim())}`
      : `discordId=${encodeURIComponent(discordId.trim())}`;
    const result = await onRequest(`/admin/public-service/account?${query}`);
    setAccount(result.account ?? null);
  });

  const lookupPlan = () => run("plan-lookup", async () => {
    const result = await onRequest(`/admin/public-service/plan?planId=${encodeURIComponent(planId.trim())}`);
    setPlan(result.plan ?? null);
  });

  const setAccountSuspended = (suspended: boolean) => run("account-status", async () => {
    const id = account?.id ?? Number(accountId);
    await onRequest(`/admin/public-service/accounts/${suspended ? "suspend" : "restore"}`, {
      method: "POST",
      body: JSON.stringify({ accountId: id }),
    });
    if (canInspect) {
      const result = await onRequest(`/admin/public-service/account?accountId=${encodeURIComponent(String(id))}`);
      setAccount(result.account ?? null);
    }
    setMessage(suspended ? "Public account suspended and active capabilities revoked." : "Public account restored.");
    await refreshHealth();
  });

  const setPlanSuspended = (suspended: boolean) => run("plan-status", async () => {
    const id = String(plan?.id ?? planId.trim());
    await onRequest(`/admin/public-service/plans/${suspended ? "suspend" : "restore"}`, {
      method: "POST",
      body: JSON.stringify({ planId: id }),
    });
    if (canInspect) {
      const result = await onRequest(`/admin/public-service/plan?planId=${encodeURIComponent(id)}`);
      setPlan(result.plan ?? null);
    }
    setMessage(suspended ? "Public plan suspended." : "Public plan restored.");
    await refreshHealth();
  });

  const revokeCapability = (kind: "invites" | "share-links") => run(`revoke-${kind}`, async () => {
    const idKey = kind === "invites" ? "inviteId" : "shareId";
    const identifier = kind === "invites" ? inviteId : shareId;
    await onRequest(`/admin/public-service/${kind}/revoke`, {
      method: "POST",
      body: JSON.stringify({ planId: plan?.id ?? planId.trim(), [idKey]: identifier.trim() }),
    });
    setMessage(kind === "invites" ? "Invitation revoked." : "Share link revoked.");
    if (canInspect) {
      const result = await onRequest(`/admin/public-service/plan?planId=${encodeURIComponent(String(plan?.id ?? planId.trim()))}`);
      setPlan(result.plan ?? null);
    }
  });

  const reviewPrivacyDeletion = () => run("privacy-review", async () => {
    const id = account?.id ?? Number(accountId);
    const result = await onRequest(`/admin/public-service/privacy/review?accountId=${encodeURIComponent(String(id))}`);
    setPrivacyReview(result);
    setDispositions(Object.fromEntries((result.ownedPlans ?? []).map((ownedPlan: OwnedPlanReview) => [ownedPlan.id, { action: "delete" }])));
  });

  const processPrivacyDeletion = () => run("privacy-delete", async () => {
    const ownedPlans: OwnedPlanReview[] = privacyReview?.ownedPlans ?? [];
    const selected = ownedPlans.map((ownedPlan) => ({ planId: ownedPlan.id, ...dispositions[ownedPlan.id] }));
    await onRequest("/admin/public-service/privacy/delete", {
      method: "POST",
      body: JSON.stringify({ accountId: privacyReview?.account?.id, dispositions: selected }),
    });
    setMessage("Public profile deletion completed and a privacy-ledger receipt was recorded.");
    setAccount(null);
    setPrivacyReview(null);
    await refreshHealth();
  });

  const totals = health?.totals ?? {};
  const ownedPlans: OwnedPlanReview[] = privacyReview?.ownedPlans ?? [];
  const allDispositionsValid = ownedPlans.every((ownedPlan) => {
    const selected = dispositions[ownedPlan.id];
    if (selected?.action === "delete") return true;
    return selected?.action === "transfer" && ownedPlan.acceptedEditors?.some((editor) => editor.userId === selected.userId);
  });

  return <div className="admin-section public-service-admin">
    {message ? <div className="admin-message info" role="status">{message}</div> : null}

    <section className="form-card">
      <div className="split-header">
        <div><h3>Public service health</h3><p className="legend">Sanitized cache, feature-gate, OAuth and rate-limit totals. Credentials are never returned.</p></div>
        <button className="toolbar-button" disabled={pending || Boolean(busy)} onClick={() => void refreshHealth()}>{busy === "health" ? "Refreshing..." : "Refresh"}</button>
      </div>
      <div className="public-admin-metrics">
        <Metric label="Accounts" value={totals.accounts ?? "-"} />
        <Metric label="Plans" value={totals.plans ?? "-"} />
        <Metric label="Suspended accounts" value={totals.suspendedAccounts ?? "-"} />
        <Metric label="Suspended plans" value={totals.suspendedPlans ?? "-"} />
      </div>
      <details><summary>Runtime detail</summary><SafeRecord value={health ? { cache: health.cache, gate: health.gate, oauth: health.oauth, rateTotals: health.rateTotals } : null} empty="Health has not loaded." /></details>
    </section>

    {canInspect ? <div className="admin-grid">
      <section className="form-card">
        <h3>Exact account lookup</h3>
        <p className="legend">Enter exactly one numeric Public account ID or exact Discord ID.</p>
        <label className="field"><span>Public account ID</span><input value={accountId} onChange={(event) => { setAccountId(event.target.value); if (event.target.value) setDiscordId(""); }} /></label>
        <label className="field"><span>Discord ID</span><input value={discordId} onChange={(event) => { setDiscordId(event.target.value); if (event.target.value) setAccountId(""); }} /></label>
        <button className="toolbar-button" disabled={Boolean(busy) || (!accountId.trim() && !discordId.trim())} onClick={() => void lookupAccount()}>Look up account</button>
        <SafeRecord value={account} empty="No account loaded." />
        {account ? <div className="toolbar">
          {account.status === "suspended"
            ? canRestore ? <button className="toolbar-button" disabled={Boolean(busy)} onClick={() => void setAccountSuspended(false)}>Restore account</button> : null
            : canModerate ? <button className="toolbar-button" disabled={Boolean(busy)} onClick={() => void setAccountSuspended(true)}>Suspend account</button> : null}
          {canProcessPrivacy ? <button className="toolbar-button" disabled={Boolean(busy)} onClick={() => void reviewPrivacyDeletion()}>Review privacy deletion</button> : null}
        </div> : null}
      </section>

      <section className="form-card">
        <h3>Exact plan lookup</h3>
        <p className="legend">Returns sanitized metadata and events only. Admins cannot edit plan documents.</p>
        <label className="field"><span>Plan ID</span><input value={planId} onChange={(event) => setPlanId(event.target.value)} /></label>
        <button className="toolbar-button" disabled={Boolean(busy) || !planId.trim()} onClick={() => void lookupPlan()}>Look up plan</button>
        <SafeRecord value={plan} empty="No plan loaded." />
        {plan ? <>
          <div className="toolbar">{plan.status === "suspended"
            ? canRestore ? <button className="toolbar-button" disabled={Boolean(busy)} onClick={() => void setPlanSuspended(false)}>Restore plan</button> : null
            : canModerate ? <button className="toolbar-button" disabled={Boolean(busy)} onClick={() => void setPlanSuspended(true)}>Suspend plan</button> : null}</div>
          {canModerate ? <div className="public-admin-capabilities">
            <label className="field"><span>Invitation ID</span><input value={inviteId} onChange={(event) => setInviteId(event.target.value)} /></label>
            <button className="toolbar-button" disabled={Boolean(busy) || !inviteId.trim()} onClick={() => void revokeCapability("invites")}>Revoke invitation</button>
            <label className="field"><span>Share-link ID</span><input value={shareId} onChange={(event) => setShareId(event.target.value)} /></label>
            <button className="toolbar-button" disabled={Boolean(busy) || !shareId.trim()} onClick={() => void revokeCapability("share-links")}>Revoke share link</button>
          </div> : null}
        </> : null}
      </section>
    </div> : canModerate ? <section className="form-card">
      <h3>Exact moderation actions</h3>
      <p className="legend">Enter exact identifiers. Results confirm only the bounded action; account, plan, and event metadata remain restricted.</p>
      <div className="public-admin-capabilities">
        <label className="field"><span>Public account ID</span><input value={accountId} onChange={(event) => setAccountId(event.target.value)} /></label>
        <button className="toolbar-button" disabled={Boolean(busy) || !accountId.trim()} onClick={() => void setAccountSuspended(true)}>Suspend account</button>
        <label className="field"><span>Plan ID</span><input value={planId} onChange={(event) => setPlanId(event.target.value)} /></label>
        <button className="toolbar-button" disabled={Boolean(busy) || !planId.trim()} onClick={() => void setPlanSuspended(true)}>Suspend plan</button>
        <label className="field"><span>Invitation ID</span><input value={inviteId} onChange={(event) => setInviteId(event.target.value)} /></label>
        <button className="toolbar-button" disabled={Boolean(busy) || !planId.trim() || !inviteId.trim()} onClick={() => void revokeCapability("invites")}>Revoke invitation</button>
        <label className="field"><span>Share-link ID</span><input value={shareId} onChange={(event) => setShareId(event.target.value)} /></label>
        <button className="toolbar-button" disabled={Boolean(busy) || !planId.trim() || !shareId.trim()} onClick={() => void revokeCapability("share-links")}>Revoke share link</button>
      </div>
    </section> : <p className="legend">Your role can view health only.</p>}

    {canProcessPrivacy && privacyReview ? <section className="form-card danger-zone">
      <h3>Documented privacy deletion processing</h3>
      <p className="legend"><strong>Recent public Discord reauthentication is mandatory.</strong> Every owned plan must transfer to an accepted editor or be permanently deleted. This operation cannot be undone.</p>
      <p>Recent reauthentication: <strong>{privacyReview.recentlyReauthenticated ? "Confirmed" : "Required"}</strong></p>
      {ownedPlans.map((ownedPlan) => <div className="public-admin-disposition" key={ownedPlan.id}>
        <strong>{ownedPlan.title} <span className="legend">({ownedPlan.id})</span></strong>
        <select value={dispositions[ownedPlan.id]?.action ?? "delete"} onChange={(event) => setDispositions((current) => ({ ...current, [ownedPlan.id]: { action: event.target.value as "delete" | "transfer" } }))}>
          <option value="delete">Permanently delete plan</option>
          <option value="transfer" disabled={!ownedPlan.acceptedEditors?.length}>Transfer to accepted editor</option>
        </select>
        {dispositions[ownedPlan.id]?.action === "transfer" ? <select value={dispositions[ownedPlan.id]?.userId ?? ""} onChange={(event) => setDispositions((current) => ({ ...current, [ownedPlan.id]: { action: "transfer", userId: Number(event.target.value) } }))}>
          <option value="">Choose accepted editor</option>
          {(ownedPlan.acceptedEditors ?? []).map((editor) => <option key={editor.userId} value={editor.userId}>{editor.globalName || editor.username || `Account ${editor.userId}`}</option>)}
        </select> : null}
      </div>)}
      <button className="toolbar-button danger" disabled={Boolean(busy) || !privacyReview.recentlyReauthenticated || !allDispositionsValid} onClick={() => void processPrivacyDeletion()}>Permanently delete Public profile</button>
    </section> : null}
  </div>;
}
