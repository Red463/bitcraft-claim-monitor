# Legitimate Interests Assessment: Security and Community Moderation

**Controller:** Thomas Bush, individual developer and operator of Timbersteel Claim Monitor  
**Contact:** privacy@timbersteeltrade.com  
**Assessment date:** 25 July 2026  
**Review date:** Before production release and at least annually thereafter

Timbersteel Claim Monitor is a free, unofficial community project, not a company or separate legal entity. This assessment covers proportionate security logging, abuse prevention, delivery diagnostics, administrator audit, and Discord community moderation.

## Purpose

The processing is intended to keep accounts, the VPS, Discord integrations, and community members safe; investigate failed or abusive actions; enforce access rules; document warnings, notes, cases, and temporary bans; and demonstrate responsible administrator activity.

Relevant data may include Discord/guild/user identifiers, administrator identity, route/status/time, short-lived IP/security information, anonymised hashes, moderation reasons, command/delivery diagnostics, and action metadata. Special-category data is not intentionally requested.

## Necessity

The service cannot reliably prevent abuse, diagnose delivery failures, or review moderation without a limited record of what happened. The design avoids message-content surveillance and broad behavioural profiling. Full IP addresses are short-lived, ordinary analytics require separate consent, and retained security records are minimised or anonymised.

## Impact and reasonable expectations

Users reasonably expect a community bot and signed-in service to keep security and moderation records, but may be harmed by excessive retention, unfair notes, disclosure, or use outside the original purpose. Free-text moderation fields can be particularly sensitive and must be factual, relevant, and access-restricted.

## Safeguards

- Administrator routes require authenticated roles, same-origin protection, and CSRF tokens.
- Security and moderation permissions remain role-limited.
- Full IP addresses are retained for no more than seven days; hashed/anonymised security records normally expire after 180 days.
- Discord delivery diagnostics expire after 90 days or the latest 250 records, whichever is sooner.
- Closed moderation records normally expire or become anonymous after 12 months unless an active safety/legal need remains.
- Optional analytics is separate, consent-based, and not repurposed for moderation.
- Logs and exports redact secrets, tokens, cookies, authorisation headers, HMAC keys, and unrelated users.
- Account deletion removes ordinary user data and anonymises only the limited records still required for safety/audit.
- Users can request access, correction, objection, deletion, or review at privacy@timbersteeltrade.com.
- No solely automated decision produces legal or similarly significant effects.

## Balance and conclusion

Protecting users and the service is a legitimate interest. The processing is necessary only while it remains minimised, access-controlled, reviewable, and subject to the stated short retention periods. The safeguards reduce the likelihood and severity of harm, so the balance favours this limited processing.

The assessment must be revisited if the app begins recording message content by default, introduces automated sanctions, materially lengthens retention, shares moderation data outside the community-operational purpose, or adds new identity sources.

**Status:** Approved as an engineering record; obtain solicitor review before production release.

