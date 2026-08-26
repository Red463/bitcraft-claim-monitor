import { adminPermissionFor } from "../adminPermissions.mjs";
import { BODY_LIMITS, readJson } from "../httpBodies.mjs";
import { sendJson } from "../httpResponses.mjs";

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error(`${label} is invalid.`);
    error.status = 400;
    error.code = "public_admin_identifier_invalid";
    throw error;
  }
  return id;
}

function exactText(value, label) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 200 || /[?#/]/.test(text)) {
    const error = new Error(`${label} is invalid.`);
    error.status = 400;
    error.code = "public_admin_identifier_invalid";
    throw error;
  }
  return text;
}

export function createPublicAdminRouter({
  repository,
  privacy,
  healthSnapshot = () => ({}),
  hasPermission,
  audit = () => undefined,
  readRequestJson = (req) => readJson(req, BODY_LIMITS.settings),
  send = sendJson,
} = {}) {
  if (!repository || !privacy || typeof hasPermission !== "function") {
    throw new TypeError("Public Admin router requires moderation, privacy, and permission services.");
  }

  return async function route({ req, res, user, method, url }) {
    const { pathname, searchParams } = url;
    if (!pathname.startsWith("/api/local/admin/public-service/")) return false;
    const permission = adminPermissionFor(method, pathname);
    if (!hasPermission(user, permission)) {
      send(res, 403, { error: "Administrator role does not allow this Public service action." });
      return true;
    }
    try {
      if (method === "GET" && pathname === "/api/local/admin/public-service/health") {
        send(res, 200, repository.health(healthSnapshot()), { "cache-control": "no-store" });
        return true;
      }
      if (method === "GET" && pathname === "/api/local/admin/public-service/account") {
        const accountId = searchParams.get("accountId");
        const discordId = searchParams.get("discordId");
        const account = repository.lookupAccount({
          ...(accountId ? { accountId: positiveId(accountId, "Public account ID") } : {}),
          ...(discordId ? { discordId: /^\d+$/.test(discordId) ? discordId : "" } : {}),
        });
        send(res, account ? 200 : 404, account ? { account } : { error: "Public account was not found." }, { "cache-control": "no-store" });
        return true;
      }
      if (method === "GET" && pathname === "/api/local/admin/public-service/plan") {
        const planId = exactText(searchParams.get("planId"), "Public plan ID");
        const plan = repository.lookupPlan(planId);
        send(res, plan ? 200 : 404, plan ? { plan } : { error: "Public plan was not found." }, { "cache-control": "no-store" });
        return true;
      }
      if (method === "POST" && (pathname === "/api/local/admin/public-service/accounts/suspend" || pathname === "/api/local/admin/public-service/accounts/restore")) {
        const body = await readRequestJson(req);
        const input = { accountId: positiveId(body.accountId, "Public account ID"), suspended: pathname.endsWith("/suspend") };
        const result = repository.setAccountSuspended(input);
        audit(user, input.suspended ? "public.account.suspended" : "public.account.restored", { accountId: input.accountId });
        send(res, 200, { [input.suspended ? "suspended" : "restored"]: true, revoked: result.revoked ?? {} }, { "cache-control": "no-store" });
        return true;
      }
      if (method === "POST" && (pathname === "/api/local/admin/public-service/plans/suspend" || pathname === "/api/local/admin/public-service/plans/restore")) {
        const body = await readRequestJson(req);
        const input = { planId: exactText(body.planId, "Public plan ID"), suspended: pathname.endsWith("/suspend") };
        const result = repository.setPlanSuspended(input);
        audit(user, input.suspended ? "public.plan.suspended" : "public.plan.restored", { planId: input.planId });
        send(res, 200, { [input.suspended ? "suspended" : "restored"]: true, revoked: result.revoked ?? {} }, { "cache-control": "no-store" });
        return true;
      }
      if (method === "POST" && pathname === "/api/local/admin/public-service/invites/revoke") {
        const body = await readRequestJson(req);
        const input = { planId: exactText(body.planId, "Public plan ID"), inviteId: exactText(body.inviteId, "Public invitation ID") };
        const result = repository.revokeInvite(input);
        audit(user, "public.invite.revoked", input);
        send(res, 200, result, { "cache-control": "no-store" });
        return true;
      }
      if (method === "POST" && pathname === "/api/local/admin/public-service/share-links/revoke") {
        const body = await readRequestJson(req);
        const input = { planId: exactText(body.planId, "Public plan ID"), shareId: exactText(body.shareId, "Public share-link ID") };
        const result = repository.revokeShareLink(input);
        audit(user, "public.share_link.revoked", input);
        send(res, 200, result, { "cache-control": "no-store" });
        return true;
      }
      if (method === "GET" && pathname === "/api/local/admin/public-service/privacy/review") {
        const accountId = positiveId(searchParams.get("accountId"), "Public account ID");
        const access = repository.privacyReview(accountId);
        const deletion = typeof privacy.review === "function" ? await privacy.review(accountId) : {};
        send(res, 200, { ...deletion, ...access }, { "cache-control": "no-store" });
        return true;
      }
      if (method === "POST" && pathname === "/api/local/admin/public-service/privacy/delete") {
        const body = await readRequestJson(req);
        const accountId = positiveId(body.accountId, "Public account ID");
        const review = repository.privacyReview(accountId);
        if (!review.recentlyReauthenticated) {
          send(res, 409, { error: "Recent public Discord reauthentication is required.", code: "recent_discord_reauthentication_required" }, { "cache-control": "no-store" });
          return true;
        }
        const receipt = await privacy.deleteAccount({
          userId: review.account.id,
          discordId: review.account.discordId,
          dispositions: body.dispositions,
        });
        audit(user, "public.privacy.deleted", { accountId });
        send(res, 200, receipt, { "cache-control": "no-store" });
        return true;
      }
      send(res, 404, { error: "Public service Admin route was not found." });
      return true;
    } catch (error) {
      const status = Number(error?.status);
      const clientError = Number.isInteger(status) && status >= 400 && status < 500;
      send(res, clientError ? status : 503, {
        error: clientError ? error.message : "Public service Admin request is temporarily unavailable.",
        code: clientError ? error.code : "public_admin_unavailable",
      }, { "cache-control": "no-store" });
      return true;
    }
  };
}
