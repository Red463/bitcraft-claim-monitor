# Discord OAuth Callback Diagnostics Design

## Context

Discord completes the authorization screen and navigates the browser to
`/api/local/auth/discord/callback` with an authorization code and matching state,
but the browser receives no HTTP response. An invalid callback reaches production
and returns the expected redirect immediately. DNS, IPv4 connectivity, `curl`,
and Node `fetch` from the VPS all reach Discord's token endpoint in under one
second.

The remaining unknown is which valid-callback stage stalls or fails: token
exchange, profile lookup, or local session persistence.

## Goals

- Bound every outbound Discord OAuth request so a callback cannot wait forever.
- Record enough production evidence to identify the failing callback stage.
- Return users to the application with a safe, stage-specific error.
- Keep OAuth codes, states, tokens, cookies, Discord IDs, and request URLs out of
  diagnostic logs.

## Non-goals

- Do not change Discord scopes, installation contexts, redirect URIs, permissions,
  or administrator authorization rules.
- Do not add a public or administrator diagnostics endpoint.
- Do not retry authorization-code exchange requests because OAuth codes are
  single-use.
- Do not force IPv4 or change host networking without evidence that address
  selection is the cause.

## Design

Add a focused Discord OAuth JSON-request helper alongside the existing OAuth flow
helpers. It will execute one supplied Discord request with an
`AbortSignal.timeout(10_000)` signal and return parsed JSON on success.

The helper will classify failures as:

- `timeout` when the request exceeds ten seconds;
- `http` when Discord returns a non-success status;
- `network` when the fetch fails before an HTTP response;
- `response` when a successful response cannot be parsed as JSON.

The callback will execute the token exchange and profile lookup through this
helper. It will emit one start event and one success or failure event for each
stage. Local account, legal-acceptance, and session persistence will similarly
emit one session success or failure event without logging the underlying record
or exception.

## Diagnostic Logging

Production journal records will use a stable prefix and key-value fields:

```text
[discord-oauth] stage=token event=start
[discord-oauth] stage=token event=success status=200 durationMs=240
[discord-oauth] stage=profile event=failure reason=timeout durationMs=10002
[discord-oauth] stage=session event=success
```

Allowed fields are:

- `stage`: `callback`, `token`, `profile`, or `session`;
- `event`: `start`, `success`, or `failure`;
- `status`: numeric Discord HTTP status when one was received;
- `reason`: bounded failure category;
- `durationMs`: elapsed whole milliseconds.

Logs must never include a request URL, request or response body, OAuth code,
state, access token, cookie, Discord ID, username, IP address, or user agent.

## Error Handling

If token exchange, profile lookup, or local session persistence fails, the
callback will:

1. log the safe failure event;
2. clear the OAuth-state cookie;
3. return an HTTP 302 redirect to the original safe return path;
4. set `auth=discord-error`;
5. set a bounded reason:
   - `discord-token-timeout`
   - `discord-token-http`
   - `discord-token-network`
   - `discord-token-response`
   - `discord-profile-timeout`
   - `discord-profile-http`
   - `discord-profile-network`
   - `discord-profile-response`
   - `discord-session`

No raw Discord response body or thrown network message will be returned to the
browser.

## Testing

Focused tests will prove:

- successful requests return parsed JSON and emit only safe diagnostic fields;
- timeout, HTTP, network, and malformed-response failures are classified;
- failure redirects preserve the existing safe return path, clear OAuth state,
  and expose only the bounded reason;
- diagnostics contain none of the supplied code, state, token, profile identity,
  URL, or response body;
- existing authorize URL, callback validation, token request, profile request,
  and successful session behavior remain unchanged.

The complete application build and backend test suite must pass before release.

## Release and Production Validation

Release the change as `0.48.1-beta.4`, merge through a focused pull request, and
deploy through the existing protected production workflow.

After deployment:

1. reproduce one Discord login;
2. record the user-facing `reason` value if one appears;
3. run:

   ```bash
   sudo journalctl \
     -u bitcraft-claim-monitor \
     --since "5 minutes ago" \
     --no-pager |
   grep '\[discord-oauth\]'
   ```

4. use the final successful or failing stage to identify the next root-cause
   investigation. Do not apply further OAuth or networking changes until that
   evidence is captured.
