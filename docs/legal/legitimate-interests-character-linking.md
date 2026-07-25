# Legitimate Interests Assessment: Administrator Character Linking

**Controller:** Thomas Bush, individual developer and operator of Timbersteel Claim Monitor  
**Contact:** privacy@timbersteeltrade.com  
**Assessment date:** 25 July 2026  
**Review date:** Before production release and at least annually thereafter

Timbersteel Claim Monitor is a free, unofficial community project, not a company or separate legal entity. This assessment records the balancing exercise for an authorised administrator assigning a public BitCraft character to an existing Discord login.

## Purpose

The processing supports accurate community identity, verified character-dependent access, settlement operations, abuse prevention, and correction of links where a user cannot or does not complete self-linking. It is not used to create a hidden profile, advertise to the user, or sell Discord data.

The data is limited to the existing app account/Discord ID, public BitCraft character ID and name, link status, acting administrator, timestamps, and delivery/audit results.

## Necessity

Self-linking remains the normal route, but it does not cover people who need assisted setup or operational correction. A manual assignment is narrower than creating a separate identity system or collecting additional proof documents. The app blocks duplicate approved links and requires the target to have accepted the current legal documents.

## Impact and reasonable expectations

A user may not expect a character link to be created without pressing the self-link button. A wrong or unwanted association could reveal community membership, affect app access, or cause embarrassment. The impact is reduced because the game identity is public, the action is limited to an existing signed-in account, and the user receives direct notice before the database change.

## Safeguards

- Only authorised administrators can use the CSRF-protected route.
- The affected Discord account must have current legal acceptance.
- The app validates the target and blocks a character already approved elsewhere.
- A direct Discord DM describing the intended assignment is required before commit; failed delivery blocks the assignment.
- The database rechecks the target and duplicate inside an immediate transaction.
- A race failure after the DM produces a best-effort corrective DM.
- The action is recorded in restricted administrator audit and moderation-delivery logs.
- Users can unlink immediately or delete their ordinary app account in Privacy & Data.
- Administrator and self-service removals commit even if a confirmation DM fails.
- Identifiers are scrubbed on deletion and retained audit data expires under the published schedule.
- Users can object or request review at privacy@timbersteeltrade.com.

## Balance and conclusion

The community-operational purpose is legitimate and the limited processing is necessary for assisted verified access. Without the DM-first safeguard and self-service removal, the user's interests would outweigh that purpose. With those controls, limited access, duplicate blocking, current acceptance, audit, retention, and objection routes, the processing is proportionate.

This conclusion must be reviewed if assignment is expanded to users without an existing account, if DMs are no longer required, if character data stops being public, or if the link begins driving materially significant decisions.

**Status:** Approved as an engineering record; obtain solicitor review before production release.

