import { clearPublicPlanSecret, publicPlanAuthorization } from "./planSecrets.mjs";

type FetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type FetchLike = (input: string, init: RequestInit) => Promise<FetchResponse>;
type PublicPlan = {
  id: string;
  title: string;
  claimId: string;
  document: { targets?: unknown[] };
  [key: string]: unknown;
};

type PublicPlanResponse = {
  error?: unknown;
  code?: unknown;
  currentRevisions?: { document?: unknown; access?: unknown };
  plan?: PublicPlan;
  [key: string]: unknown;
};

const SAFE_PUBLIC_PLAN_ERROR_CODES = new Set([
  "invite_expired",
  "invite_not_found",
  "legal_acceptance_required",
  "public_csrf_rejected",
  "public_origin_rejected",
  "public_plan_request_failed",
  "public_session_required",
  "plan_archived",
  "plan_not_found",
  "plan_suspended",
  "revision_conflict",
  "revision_required",
]);

export class PublicPlanRequestError extends Error {
  status: number;
  code: string;
  currentRevisions: { document?: number; access?: number } | null;

  constructor(message: string, status: number, payload: PublicPlanResponse) {
    super(message);
    this.name = "PublicPlanRequestError";
    this.status = status;
    this.code = typeof payload.code === "string" && SAFE_PUBLIC_PLAN_ERROR_CODES.has(payload.code)
      ? payload.code
      : "public_plan_request_failed";
    const revisions = Object.fromEntries(Object.entries(payload.currentRevisions ?? {}).flatMap(([key, value]) => {
      const revision = Number(value);
      return (key === "document" || key === "access") && Number.isSafeInteger(revision) && revision > 0
        ? [[key, revision]]
        : [];
    })) as { document?: number; access?: number };
    this.currentRevisions = Object.keys(revisions).length ? revisions : null;
  }
}

function responseBody(value: unknown): PublicPlanResponse {
  return value && typeof value === "object" && !Array.isArray(value) ? value as PublicPlanResponse : {};
}

async function readResponse(response: FetchResponse): Promise<PublicPlanResponse> {
  return responseBody(await response.json().catch(() => ({})));
}

function sharedPlanError(status: number, payload: PublicPlanResponse) {
  return new PublicPlanRequestError("This shared plan is unavailable.", status, payload);
}

function inviteError(status: number, payload: PublicPlanResponse) {
  const message = status === 401
    ? "Sign in before accepting this invitation."
    : status === 404 || status === 410
      ? "This invitation is no longer available."
      : status === 409
        ? "The plan changed. Select Accept invitation to try again."
        : payload.code === "legal_acceptance_required"
          ? "Accept the current Terms and Privacy Policy before accepting this invitation."
          : "This invitation could not be accepted.";
  return new PublicPlanRequestError(message, status, payload);
}

function collaborationError(status: number, payload: PublicPlanResponse) {
  const message = status === 409 && payload.code === "revision_conflict"
    ? "This plan changed on the server. Your unsaved draft has been kept."
    : status === 401
      ? "Sign in to manage plans."
      : status === 423
        ? "This plan is currently locked."
        : "The plan request could not be completed.";
  return new PublicPlanRequestError(message, status, payload);
}

function authorization(pathname: string, sessionStorage: Storage) {
  return publicPlanAuthorization(pathname, sessionStorage) as Record<string, string>;
}

async function getCollaborationPayload(path: string, fetchImpl: FetchLike) {
  const response = await fetchImpl(path, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const payload = await readResponse(response);
  if (!response.ok) throw collaborationError(response.status, payload);
  return payload;
}

export async function loadSharedPublicPlan({
  planId,
  pathname,
  sessionStorage,
  signal,
  fetchImpl = fetch,
}: {
  planId: string;
  pathname: string;
  sessionStorage: Storage;
  signal?: AbortSignal;
  fetchImpl?: FetchLike;
}): Promise<PublicPlan> {
  const response = await fetchImpl(`/api/public/shared-plans/${encodeURIComponent(planId)}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { accept: "application/json", ...authorization(pathname, sessionStorage) },
  });
  const payload = await readResponse(response);
  if (!response.ok || !payload.plan) throw sharedPlanError(response.status, payload);
  return payload.plan;
}

async function postInviteAcceptance({
  inviteId,
  pathname,
  csrfToken,
  sessionStorage,
  fetchImpl,
  accessRevision,
}: {
  inviteId: string;
  pathname: string;
  csrfToken: string;
  sessionStorage: Storage;
  fetchImpl: FetchLike;
  accessRevision?: number;
}) {
  const response = await fetchImpl(`/api/public/invites/${encodeURIComponent(inviteId)}/accept`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-csrf-token": csrfToken,
      ...authorization(pathname, sessionStorage),
      ...(accessRevision == null ? {} : { "if-match": `"access:${accessRevision}"` }),
    },
  });
  return { response, payload: await readResponse(response) };
}

export async function acceptPublicPlanInvite({
  inviteId,
  pathname,
  csrfToken,
  sessionStorage,
  fetchImpl = fetch,
}: {
  inviteId: string;
  pathname: string;
  csrfToken: string;
  sessionStorage: Storage;
  fetchImpl?: FetchLike;
}): Promise<PublicPlan> {
  let result = await postInviteAcceptance({ inviteId, pathname, csrfToken, sessionStorage, fetchImpl });
  if (result.response.status === 428 && result.payload.code === "revision_required") {
    const access = Number(result.payload.currentRevisions?.access);
    if (Number.isSafeInteger(access) && access > 0) {
      result = await postInviteAcceptance({ inviteId, pathname, csrfToken, sessionStorage, fetchImpl, accessRevision: access });
    }
  }
  if (result.response.ok && result.payload.plan) {
    clearPublicPlanSecret(pathname, sessionStorage);
    return result.payload.plan;
  }
  if (result.response.status === 404 || result.response.status === 410) {
    clearPublicPlanSecret(pathname, sessionStorage);
  }
  throw inviteError(result.response.status, result.payload);
}

export async function savePublicPlanDocument({
  planId,
  document,
  documentRevision,
  csrfToken,
  fetchImpl = fetch,
}: {
  planId: string;
  document: unknown;
  documentRevision: number;
  csrfToken: string;
  fetchImpl?: FetchLike;
}): Promise<PublicPlan> {
  const response = await fetchImpl(`/api/public/plans/${encodeURIComponent(planId)}/document`, {
    method: "PUT",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
      "if-match": `"document:${documentRevision}"`,
    },
    body: JSON.stringify({ document }),
  });
  const payload = await readResponse(response);
  if (!response.ok || !payload.plan) throw collaborationError(response.status, payload);
  return payload.plan;
}

export async function mutatePublicPlanAccess<T extends PublicPlanResponse>({
  path,
  method,
  body,
  accessRevision,
  csrfToken,
  fetchImpl = fetch,
}: {
  path: string;
  method: "POST" | "PATCH" | "DELETE";
  body?: unknown;
  accessRevision: number;
  csrfToken: string;
  fetchImpl?: FetchLike;
}): Promise<T> {
  if (!path.startsWith("/api/public/plans/")) throw new TypeError("Public plan mutation path is invalid.");
  const response = await fetchImpl(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      "x-csrf-token": csrfToken,
      "if-match": `"access:${accessRevision}"`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await readResponse(response) as T;
  if (!response.ok) throw collaborationError(response.status, payload);
  return payload;
}

export async function loadPublicPlans(fetchImpl: FetchLike = fetch): Promise<PublicPlan[]> {
  const payload = await getCollaborationPayload("/api/public/plans", fetchImpl);
  return Array.isArray(payload.plans) ? payload.plans as PublicPlan[] : [];
}

export async function loadPublicPlan(planId: string, fetchImpl: FetchLike = fetch): Promise<PublicPlan> {
  const payload = await getCollaborationPayload(`/api/public/plans/${encodeURIComponent(planId)}`, fetchImpl);
  if (!payload.plan) throw collaborationError(503, {});
  return payload.plan;
}

export async function loadPublicPlanEvents(planId: string, fetchImpl: FetchLike = fetch): Promise<Record<string, unknown>[]> {
  const payload = await getCollaborationPayload(`/api/public/plans/${encodeURIComponent(planId)}/events`, fetchImpl);
  return Array.isArray(payload.events) ? payload.events as Record<string, unknown>[] : [];
}

export async function createPublicPlan({
  claimId,
  title,
  document,
  csrfToken,
  fetchImpl = fetch,
}: {
  claimId: string;
  title: string;
  document: unknown;
  csrfToken: string;
  fetchImpl?: FetchLike;
}): Promise<PublicPlan> {
  const response = await fetchImpl("/api/public/plans", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-csrf-token": csrfToken,
      "if-match": "*",
    },
    body: JSON.stringify({ claimId, title, document }),
  });
  const payload = await readResponse(response);
  if (!response.ok || !payload.plan) throw collaborationError(response.status, payload);
  return payload.plan;
}
