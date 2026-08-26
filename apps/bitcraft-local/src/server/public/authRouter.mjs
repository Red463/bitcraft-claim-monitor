import { randomBytes as cryptoRandomBytes } from "node:crypto";

import {
  discordOAuthJsonRequest,
  discordOAuthProfileAccount,
  discordOAuthProfileRequest,
  discordOAuthTokenRequest,
} from "../discordOAuthFlow.mjs";
import { BODY_LIMITS, readJson } from "../httpBodies.mjs";
import { csrfTokenForCookie, validCsrfHeader } from "../httpCsrf.mjs";
import { sendJson } from "../httpResponses.mjs";
import {
  isCurrentLegalAcceptance,
  isCurrentOAuthLegalAcceptance,
  publicLegalStatus,
} from "../legalAcceptance.mjs";
import { sessionTokenFromRequest, sessionTokenHash } from "../serverSessions.mjs";
import {
  PUBLIC_ORIGIN,
  PUBLIC_USER_SESSION_COOKIE_NAME,
  buildPublicDiscordAuthorizeUrl,
  clearPublicOAuthStateCookie,
  clearPublicPrivacyReauthCookie,
  clearPublicUserSessionCookie,
  createPublicUserSession,
  publicOAuthStateCookie,
  publicPrivacyReauthCookie,
  readPublicOAuthStateCookie,
  readPublicPrivacyReauthCookie,
} from "./auth.mjs";
import { publicAccountView } from "./identity.mjs";

export function exactPublicOriginRequest(req) {
  const value = String(req.headers.origin ?? "").trim();
  if (!value) return false;
  try {
    const origin = new URL(value);
    return origin.origin === PUBLIC_ORIGIN
      && !origin.username
      && !origin.password
      && origin.pathname === "/"
      && !origin.search
      && !origin.hash;
  } catch {
    return false;
  }
}

function redirect(res, location, setCookie) {
  res.writeHead(302, { location, ...(setCookie ? { "set-cookie": setCookie } : {}) });
  res.end();
  return true;
}

function validPublicState(stateCookie, suppliedState) {
  return Boolean(stateCookie?.state)
    && String(stateCookie.state) === String(suppliedState ?? "");
}

export function createPublicAuthRouter({
  repository,
  legalPolicy,
  legalSnapshot,
  stateSecret,
  config,
  fetchImpl = fetch,
  now = () => new Date(),
  randomBytes = cryptoRandomBytes,
  readRequestJson = (req) => readJson(req, BODY_LIMITS.auth),
  send = sendJson,
} = {}) {
  if (!repository || !legalPolicy || !legalSnapshot || !stateSecret || !config) {
    throw new TypeError("Public auth router requires an isolated repository, policy, state secret, and OAuth config");
  }

  function publicSession(req) {
    const token = sessionTokenFromRequest(req, PUBLIC_USER_SESSION_COOKIE_NAME);
    if (!token) return null;
    const tokenHash = sessionTokenHash(token);
    const user = repository.sessionUser(tokenHash, now().toISOString());
    return user ? { token, tokenHash, user } : null;
  }

  function status(req) {
    const session = publicSession(req);
    const acceptance = session ? repository.currentLegalAcceptance(session.user.id) : null;
    return {
      user: publicAccountView(session?.user),
      csrfToken: session ? csrfTokenForCookie(req, PUBLIC_USER_SESSION_COOKIE_NAME) : null,
      discordLoginEnabled: config.enabled,
      featurebaseJwt: null,
      analyticsEnabled: false,
      legal: session
        ? publicLegalStatus(acceptance, legalSnapshot)
        : { ...legalSnapshot, acceptedAt: null, requiresAcceptance: false },
    };
  }

  function requireSession(req, res, { mutation = false, allowStaleLegal = false } = {}) {
    const session = publicSession(req);
    if (!session) {
      send(res, 401, { error: "Discord sign-in required" });
      return null;
    }
    if (mutation) {
      if (!exactPublicOriginRequest(req)) {
        send(res, 403, { error: "Cross-origin public account request rejected" });
        return null;
      }
      const expected = csrfTokenForCookie(req, PUBLIC_USER_SESSION_COOKIE_NAME);
      if (!validCsrfHeader(expected, req.headers["x-csrf-token"])) {
        send(res, 403, { error: "Invalid public account request token" });
        return null;
      }
    }
    const acceptance = repository.currentLegalAcceptance(session.user.id);
    if (!allowStaleLegal && !isCurrentLegalAcceptance(acceptance, legalSnapshot)) {
      send(res, 428, {
        error: "Accept the current Terms and Privacy Policy to continue",
        code: "legal_acceptance_required",
        legal: publicLegalStatus(acceptance, legalSnapshot),
      });
      return null;
    }
    return session;
  }

  async function exchangeDiscordProfile(code) {
    const token = await discordOAuthJsonRequest({
      request: discordOAuthTokenRequest({ config, code }),
      stage: "token",
      fetchImpl,
      now: () => now().getTime(),
    });
    return discordOAuthJsonRequest({
      request: discordOAuthProfileRequest(token.access_token),
      stage: "profile",
      fetchImpl,
      now: () => now().getTime(),
    });
  }

  async function handleStart(req, res) {
    if (!exactPublicOriginRequest(req)) return send(res, 403, { error: "Cross-origin Discord sign-in rejected" });
    const body = await readRequestJson(req);
    if (body.acceptedTerms !== true || body.ageConfirmed !== true) {
      return send(res, 400, { error: "Accept the Terms and Privacy Policy and confirm that you are at least 18" });
    }
    if (!config.enabled) return send(res, 503, { error: "Public Discord login is not configured" });
    const state = randomBytes(24).toString("base64url");
    const acceptedAt = now().toISOString();
    return send(res, 200, {
      authorizeUrl: buildPublicDiscordAuthorizeUrl({ config, state }),
    }, {
      "set-cookie": publicOAuthStateCookie(state, body.returnTo, {
        secret: stateSecret,
        purpose: "login",
        legal: { ...legalSnapshot, ageConfirmed: true, acceptedAt },
        now,
      }),
    });
  }

  async function handleReauthStart(req, res) {
    const session = requireSession(req, res, { mutation: true, allowStaleLegal: true });
    if (!session) return true;
    if (!config.enabled) return send(res, 503, { error: "Public Discord login is not configured" });
    const state = randomBytes(24).toString("base64url");
    return send(res, 200, {
      authorizeUrl: buildPublicDiscordAuthorizeUrl({ config, state }),
    }, {
      "set-cookie": publicOAuthStateCookie(state, "/settings?privacy=delete-ready", {
        secret: stateSecret,
        purpose: "privacy-delete",
        reauth: {
          userId: session.user.id,
          discordId: String(session.user.discord_id),
          sessionTokenHash: session.tokenHash,
        },
        now,
      }),
    });
  }

  async function handleCallback(req, res, url) {
    const stateCookie = readPublicOAuthStateCookie(req, stateSecret, { now });
    const suppliedState = url.searchParams.get("state") ?? "";
    const denied = url.searchParams.get("error");
    if (denied || !config.enabled || !url.searchParams.get("code") || !validPublicState(stateCookie, suppliedState)) {
      return redirect(res, stateCookie?.returnTo ? `${stateCookie.returnTo}${stateCookie.returnTo.includes("?") ? "&" : "?"}auth=discord-error` : "/?auth=discord-error", clearPublicOAuthStateCookie());
    }

    const reauthentication = stateCookie.purpose === "privacy-delete";
    const existingSession = reauthentication ? publicSession(req) : null;
    if (reauthentication && (
      !existingSession
      || Number(stateCookie.reauth?.userId) !== Number(existingSession.user.id)
      || String(stateCookie.reauth?.discordId) !== String(existingSession.user.discord_id)
      || String(stateCookie.reauth?.sessionTokenHash) !== existingSession.tokenHash
    )) {
      send(res, 403, {
        error: "The public deletion reauthentication session no longer matches",
        code: "privacy_reauthentication_mismatch",
      }, { "set-cookie": clearPublicOAuthStateCookie() });
      return true;
    }
    if (!reauthentication && !isCurrentOAuthLegalAcceptance(stateCookie.legal, legalSnapshot)) {
      return redirect(res, "/?auth=discord-error&reason=legal", clearPublicOAuthStateCookie());
    }

    let profile;
    try {
      profile = await exchangeDiscordProfile(String(url.searchParams.get("code")));
    } catch {
      return redirect(res, `${stateCookie.returnTo}${stateCookie.returnTo.includes("?") ? "&" : "?"}auth=discord-error`, clearPublicOAuthStateCookie());
    }

    if (reauthentication) {
      if (String(profile?.id ?? "") !== String(existingSession.user.discord_id)) {
        send(res, 403, {
          error: "Reauthenticate with the Discord account currently signed in",
          code: "privacy_reauthentication_account_mismatch",
        }, { "set-cookie": [clearPublicOAuthStateCookie(), clearPublicPrivacyReauthCookie()] });
        return true;
      }
      const reauthenticatedAt = now().toISOString();
      const updated = repository.markSessionReauthenticated(
        existingSession.tokenHash,
        existingSession.user.id,
        reauthenticatedAt,
      );
      if (Number(updated.changes) !== 1) {
        send(res, 403, {
          error: "The signed-in public session is no longer available",
          code: "privacy_reauthentication_session_missing",
        }, { "set-cookie": clearPublicOAuthStateCookie() });
        return true;
      }
      return redirect(res, stateCookie.returnTo, [
        clearPublicOAuthStateCookie(),
        publicPrivacyReauthCookie({
          userId: existingSession.user.id,
          discordId: existingSession.user.discord_id,
          sessionTokenHash: existingSession.tokenHash,
          reauthenticatedAt,
        }, { secret: stateSecret }),
      ]);
    }

    const loginAt = now().toISOString();
    const profileAccount = discordOAuthProfileAccount(profile, loginAt);
    const account = repository.upsertAccount(profileAccount, loginAt);
    repository.acceptLegal({
      userId: account.id,
      version: stateCookie.legal.version,
      termsDigest: stateCookie.legal.termsDigest,
      privacyDigest: stateCookie.legal.privacyDigest,
      acceptedAt: stateCookie.legal.acceptedAt,
      source: "oauth",
    });
    const session = createPublicUserSession({ now: now(), randomBytes });
    repository.insertSession({
      tokenHash: session.tokenHash,
      userId: account.id,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
    });
    return redirect(res, stateCookie.returnTo, [clearPublicOAuthStateCookie(), session.cookie]);
  }

  return async function route({ req, method, url, res }) {
    const { pathname } = url;
    if (method === "GET" && pathname === "/api/public/legal") {
      send(res, 200, { ...legalPolicy, termsDigest: legalSnapshot.termsDigest, privacyDigest: legalSnapshot.privacyDigest });
      return true;
    }
    if (method === "GET" && pathname === "/api/public/auth/session") {
      send(res, 200, status(req), { "cache-control": "no-store" });
      return true;
    }
    if (method === "POST" && pathname === "/api/public/auth/discord/start") {
      await handleStart(req, res);
      return true;
    }
    if (method === "GET" && pathname === "/api/public/auth/discord/callback") {
      return handleCallback(req, res, url);
    }
    if (method === "POST" && pathname === "/api/public/auth/legal/accept") {
      const session = requireSession(req, res, { mutation: true, allowStaleLegal: true });
      if (!session) return true;
      const body = await readRequestJson(req);
      if (body.acceptedTerms !== true || body.ageConfirmed !== true) {
        send(res, 400, { error: "Accept the Terms and Privacy Policy and confirm that you are at least 18" });
        return true;
      }
      repository.acceptLegal({
        userId: session.user.id,
        ...legalSnapshot,
        acceptedAt: now().toISOString(),
        source: "existing-session",
      });
      send(res, 200, status(req));
      return true;
    }
    if (method === "POST" && pathname === "/api/public/auth/logout") {
      const session = requireSession(req, res, { mutation: true, allowStaleLegal: true });
      if (!session) return true;
      repository.deleteSession(session.tokenHash);
      send(res, 200, { ok: true }, {
        "set-cookie": [clearPublicUserSessionCookie(), clearPublicOAuthStateCookie(), clearPublicPrivacyReauthCookie()],
      });
      return true;
    }
    if (method === "GET" && pathname === "/api/public/auth/privacy/export") {
      const session = requireSession(req, res, { allowStaleLegal: true });
      if (!session) return true;
      const exportedAt = now().toISOString();
      send(res, 200, repository.exportAccount(session.user.id, {
        legalVersion: legalSnapshot.version,
        exportedAt,
      }), {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="bitcraft-claim-monitor-data-${exportedAt.slice(0, 10)}.json"`,
      });
      return true;
    }
    if (method === "POST" && pathname === "/api/public/auth/privacy/reauth/start") {
      await handleReauthStart(req, res);
      return true;
    }
    if (method === "POST" && pathname === "/api/public/auth/privacy/deletion-preflight") {
      const session = requireSession(req, res, { mutation: true, allowStaleLegal: true });
      if (!session) return true;
      const proof = readPublicPrivacyReauthCookie(req, stateSecret, { now });
      const stored = repository.sessionByToken(session.tokenHash, session.user.id);
      if (
        !proof
        || Number(proof.userId) !== Number(session.user.id)
        || String(proof.discordId) !== String(session.user.discord_id)
        || String(proof.sessionTokenHash) !== session.tokenHash
        || String(stored?.reauthenticated_at ?? "") !== String(proof.reauthenticatedAt)
      ) {
        send(res, 403, {
          error: "Reauthenticate with Discord before reviewing account deletion",
          code: "recent_discord_reauthentication_required",
        }, { "set-cookie": clearPublicPrivacyReauthCookie() });
        return true;
      }
      send(res, 200, {
        ok: true,
        recentlyReauthenticated: true,
        canDelete: false,
        planDispositionReviewRequired: true,
      });
      return true;
    }
    return false;
  };
}
