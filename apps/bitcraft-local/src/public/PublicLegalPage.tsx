import React from "react";

import { loadPublicLegal, type PublicLegalPolicy } from "./accountApi";

export function PublicLegalPage({ type }: { type: "terms" | "privacy" }) {
  const [policy, setPolicy] = React.useState<PublicLegalPolicy | null>(null);
  const [error, setError] = React.useState("");
  React.useEffect(() => {
    let active = true;
    loadPublicLegal()
      .then((next) => { if (active) setPolicy(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "The legal document is unavailable."); });
    return () => { active = false; };
  }, []);
  if (error) return <section className="public-panel public-legal-page" role="alert">{error}</section>;
  if (!policy) return <section className="public-panel public-legal-page" role="status">Loading legal document…</section>;
  const document = type === "terms" ? policy.terms : policy.privacy;
  return <article className="public-panel public-legal-page">
    <header><p className="public-eyebrow">BitCraft Claim Monitor</p><h1>{document.title}</h1><p>Version {policy.version} · effective {policy.effectiveDate}</p></header>
    {document.sections.map((section) => <section key={section.id} id={section.id}>
      <h2>{section.title}</h2>
      {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.bullets?.length ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
    </section>)}
    {type === "privacy" ? <>
      <section><h2>Providers</h2>{policy.providers.map((provider) => <div className="public-legal-row" key={provider.key}><strong>{provider.name}</strong><span>{provider.role}</span><p>{provider.data} {provider.location}</p></div>)}</section>
      <section><h2>Retention</h2>{policy.retention.map((rule) => <div className="public-legal-row" key={rule.key}><strong>{rule.label}</strong><span>{rule.rule}</span></div>)}</section>
    </> : null}
    <footer>Contact <a href={`mailto:${policy.operator.privacyEmail}`}>{policy.operator.privacyEmail}</a>.</footer>
  </article>;
}
