import { BODY_LIMITS, readJson } from "../httpBodies.mjs";
import { csrfTokenForCookie, validCsrfHeader } from "../httpCsrf.mjs";
import { sendJson } from "../httpResponses.mjs";
import { isCurrentLegalAcceptance, publicLegalStatus } from "../legalAcceptance.mjs";
import { sessionTokenFromRequest, sessionTokenHash } from "../serverSessions.mjs";
import { PUBLIC_USER_SESSION_COOKIE_NAME } from "./auth.mjs";
import { exactPublicOriginRequest } from "./authRouter.mjs";
import { PublicPlanError } from "./publicPlans.mjs";

const PUBLIC_PLAN_REQUEST_LIMIT = BODY_LIMITS.settings + (16 * 1024);

function headerValue(req, name) {
  const value = req?.headers?.[name];
  return String(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
}

function parseIfMatch(req, { create = false } = {}) {
  const raw = headerValue(req, "if-match");
  if (!raw) throw new PublicPlanError("If-Match is required for public plan mutations.", 428, "revision_required");
  if (create) {
    if (raw !== "*") throw new PublicPlanError("New public plans require If-Match: *.", 409, "revision_conflict");
    return "*";
  }
  const normalized = raw.replace(/^W\//, "").replace(/^"(\d+)"$/, "$1");
  if (!/^[1-9]\d*$/.test(normalized) || !Number.isSafeInteger(Number(normalized))) {
    throw new PublicPlanError("Public plan If-Match revision is invalid.", 400, "revision_invalid");
  }
  return Number(normalized);
}

function publicPlanErrorBody(error) {
  return {
    error: error.message,
    code: error.code,
    ...(error.currentRevisions ? { currentRevisions: error.currentRevisions } : {}),
  };
}

function bearerToken(req) {
  const match = /^Bearer ([A-Za-z0-9_-]+)$/.exec(headerValue(req, "authorization"));
  return match?.[1] ?? "";
}

function userId(value) {
  const normalized = typeof value === "number" ? value : Number(String(value ?? ""));
  if (!Number.isSafeInteger(normalized) || normalized <= 0) throw new PublicPlanError("Public plan user id is invalid.");
  return normalized;
}

export function createPublicPlanRouter({
  repository,
  identityRepository,
  legalSnapshot,
  computation,
  now = () => new Date(),
  readRequestJson = (req) => readJson(req, PUBLIC_PLAN_REQUEST_LIMIT),
  send = sendJson,
} = {}) {
  if (!repository || !identityRepository || !legalSnapshot || typeof computation?.compute !== "function") {
    throw new TypeError("Public plan router requires isolated plan/identity repositories, legal policy, and computation.");
  }

  function session(req) {
    const token = sessionTokenFromRequest(req, PUBLIC_USER_SESSION_COOKIE_NAME);
    if (!token) return null;
    const user = identityRepository.sessionUser(sessionTokenHash(token), now().toISOString());
    return user ? { user } : null;
  }

  function requireSession(req, res, { mutation = false, create = false } = {}) {
    const current = session(req);
    if (!current) {
      send(res, 401, { error: "Discord sign-in required", code: "public_session_required" });
      return null;
    }
    const acceptance = identityRepository.currentLegalAcceptance(current.user.id);
    if (!isCurrentLegalAcceptance(acceptance, legalSnapshot)) {
      send(res, 428, {
        error: "Accept the current Terms and Privacy Policy to continue",
        code: "legal_acceptance_required",
        legal: publicLegalStatus(acceptance, legalSnapshot),
      });
      return null;
    }
    if (mutation) {
      if (!exactPublicOriginRequest(req)) {
        send(res, 403, { error: "Cross-origin public plan request rejected", code: "public_origin_rejected" });
        return null;
      }
      const expectedCsrf = csrfTokenForCookie(req, PUBLIC_USER_SESSION_COOKIE_NAME);
      if (!validCsrfHeader(expectedCsrf, req.headers["x-csrf-token"])) {
        send(res, 403, { error: "Invalid public plan request token", code: "public_csrf_rejected" });
        return null;
      }
      try {
        current.ifMatch = parseIfMatch(req, { create });
      } catch (error) {
        send(res, error.status, publicPlanErrorBody(error));
        return null;
      }
    }
    return current;
  }

  return async function route({ req, method, url, res }) {
    const { pathname } = url;
    const isPlansCollection = pathname === "/api/public/plans";
    if (!isPlansCollection && !pathname.startsWith("/api/public/plans/") && !pathname.startsWith("/api/public/invites/") && !pathname.startsWith("/api/public/shared-plans/")) {
      return false;
    }
    try {
      if (method === "GET" && isPlansCollection) {
        const current = requireSession(req, res);
        if (!current) return true;
        send(res, 200, { plans: repository.listPlans(current.user.id) }, { "cache-control": "no-store" });
        return true;
      }
      if (method === "POST" && isPlansCollection) {
        const current = requireSession(req, res, { mutation: true, create: true });
        if (!current) return true;
        const body = await readRequestJson(req);
        const plan = repository.createPlan({
          ownerUserId: current.user.id,
          claimId: body.claimId,
          title: body.title,
          document: body.document,
        });
        send(res, 201, { plan }, { "cache-control": "no-store" });
        return true;
      }

      const sharedComputation = pathname.match(/^\/api\/public\/shared-plans\/([^/]+)\/computation$/);
      if (method === "GET" && sharedComputation) {
        const plan = repository.planForShare(sharedComputation[1], bearerToken(req));
        send(res, 200, { computation: await computation.compute(plan) }, { "cache-control": "no-store" });
        return true;
      }
      const sharedPlan = pathname.match(/^\/api\/public\/shared-plans\/([^/]+)$/);
      if (method === "GET" && sharedPlan) {
        send(res, 200, { plan: repository.planForShare(sharedPlan[1], bearerToken(req)) }, { "cache-control": "no-store" });
        return true;
      }

      const inviteAcceptance = pathname.match(/^\/api\/public\/invites\/([^/]+)\/accept$/);
      if (method === "POST" && inviteAcceptance) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const plan = repository.acceptInvite({
          inviteId: inviteAcceptance[1],
          userId: current.user.id,
          token: bearerToken(req),
          expectedAccessRevision: current.ifMatch,
        });
        send(res, 200, { plan }, { "cache-control": "no-store" });
        return true;
      }

      const documentRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/document$/);
      if (method === "PUT" && documentRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const body = await readRequestJson(req);
        const plan = repository.updateDocument({
          planId: documentRoute[1],
          actorUserId: current.user.id,
          document: body.document ?? body,
          expectedDocumentRevision: current.ifMatch,
        });
        send(res, 200, { plan }, { "cache-control": "no-store" });
        return true;
      }
      const computationRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/computation$/);
      if (method === "GET" && computationRoute) {
        const current = requireSession(req, res);
        if (!current) return true;
        const plan = repository.planForUser(computationRoute[1], current.user.id);
        if (!plan) throw new PublicPlanError("Public plan was not found.", 404, "plan_not_found");
        send(res, 200, { computation: await computation.compute(plan) }, { "cache-control": "no-store" });
        return true;
      }
      const cloneRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/clone$/);
      if (method === "POST" && cloneRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const body = await readRequestJson(req);
        const plan = repository.clonePlan({
          planId: cloneRoute[1],
          actorUserId: current.user.id,
          title: body.title,
          expectedAccessRevision: current.ifMatch,
        });
        send(res, 201, { plan }, { "cache-control": "no-store" });
        return true;
      }
      const statusRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/status$/);
      if (method === "PATCH" && statusRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const body = await readRequestJson(req);
        const plan = repository.updateStatus({
          planId: statusRoute[1],
          actorUserId: current.user.id,
          status: body.status,
          expectedAccessRevision: current.ifMatch,
        });
        send(res, 200, { plan }, { "cache-control": "no-store" });
        return true;
      }
      const transferRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/transfer$/);
      if (method === "POST" && transferRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const body = await readRequestJson(req);
        const plan = repository.transferPlan({
          planId: transferRoute[1],
          actorUserId: current.user.id,
          userId: userId(body.userId),
          expectedAccessRevision: current.ifMatch,
        });
        send(res, 200, { plan }, { "cache-control": "no-store" });
        return true;
      }
      const eventsRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/events$/);
      if (method === "GET" && eventsRoute) {
        const current = requireSession(req, res);
        if (!current) return true;
        send(res, 200, { events: repository.eventsForUser(eventsRoute[1], current.user.id) }, { "cache-control": "no-store" });
        return true;
      }
      const inviteItemRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/invites\/([^/]+)$/);
      if (method === "DELETE" && inviteItemRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const result = repository.revokeInvite({
          planId: inviteItemRoute[1],
          inviteId: inviteItemRoute[2],
          actorUserId: current.user.id,
          expectedAccessRevision: current.ifMatch,
        });
        send(res, 200, result, { "cache-control": "no-store" });
        return true;
      }
      const inviteCollectionRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/invites$/);
      if (method === "POST" && inviteCollectionRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const body = await readRequestJson(req);
        const invite = repository.createInvite({
          planId: inviteCollectionRoute[1],
          actorUserId: current.user.id,
          role: body.role,
          expectedAccessRevision: current.ifMatch,
        });
        send(res, 201, { invite }, { "cache-control": "no-store" });
        return true;
      }
      const memberRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/members\/([^/]+)$/);
      if ((method === "PATCH" || method === "DELETE") && memberRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const values = {
          planId: memberRoute[1],
          actorUserId: current.user.id,
          userId: userId(memberRoute[2]),
          expectedAccessRevision: current.ifMatch,
        };
        const result = method === "PATCH"
          ? repository.updateMember({ ...values, role: (await readRequestJson(req)).role })
          : repository.removeMember(values);
        send(res, 200, result, { "cache-control": "no-store" });
        return true;
      }
      const shareItemRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/share-links\/([^/]+)$/);
      if (method === "DELETE" && shareItemRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const result = repository.revokeShareLink({
          planId: shareItemRoute[1],
          shareId: shareItemRoute[2],
          actorUserId: current.user.id,
          expectedAccessRevision: current.ifMatch,
        });
        send(res, 200, result, { "cache-control": "no-store" });
        return true;
      }
      const shareCollectionRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)\/share-links$/);
      if (method === "POST" && shareCollectionRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const body = await readRequestJson(req);
        const shareLink = repository.createShareLink({
          planId: shareCollectionRoute[1],
          actorUserId: current.user.id,
          label: body.label,
          expectedAccessRevision: current.ifMatch,
        });
        send(res, 201, { shareLink }, { "cache-control": "no-store" });
        return true;
      }
      const planRoute = pathname.match(/^\/api\/public\/plans\/([^/]+)$/);
      if (method === "GET" && planRoute) {
        const current = requireSession(req, res);
        if (!current) return true;
        const plan = repository.planDetailsForUser(planRoute[1], current.user.id);
        if (!plan) throw new PublicPlanError("Public plan was not found.", 404, "plan_not_found");
        send(res, 200, { plan }, { "cache-control": "no-store" });
        return true;
      }
      if (method === "DELETE" && planRoute) {
        const current = requireSession(req, res, { mutation: true });
        if (!current) return true;
        const result = repository.deletePlan({
          planId: planRoute[1],
          actorUserId: current.user.id,
          expectedAccessRevision: current.ifMatch,
        });
        send(res, 200, result, { "cache-control": "no-store" });
        return true;
      }
      return false;
    } catch (error) {
      if (error instanceof PublicPlanError) {
        send(res, error.status, publicPlanErrorBody(error), { "cache-control": "no-store" });
        return true;
      }
      if (Number(error?.statusCode) === 413) {
        send(res, 413, { error: "Public plan request body exceeds the supported limit.", code: "public_plan_body_too_large" });
        return true;
      }
      send(res, 503, { error: "Public plan service is temporarily unavailable.", code: "public_plan_unavailable" });
      return true;
    }
  };
}
