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
  currentRevisions?: { access?: unknown };
  plan?: PublicPlan;
};

const SAFE_PUBLIC_PLAN_ERROR_CODES = new Set([
  "invite_expired",
  "invite_not_found",
  "legal_acceptance_required",
  "public_csrf_rejected",
  "public_origin_rejected",
  "public_plan_request_failed",
  "public_session_required",
  "revision_conflict",
  "revision_required",
]);

export class PublicPlanRequestError extends Error {
  status: number;
  code: string;
  currentRevisions: { access?: number } | null;

  constructor(message: string, status: number, payload: PublicPlanResponse) {
    super(message);
    this.name = "PublicPlanRequestError";
    this.status = status;
    this.code = typeof payload.code === "string" && SAFE_PUBLIC_PLAN_ERROR_CODES.has(payload.code)
      ? payload.code
      : "public_plan_request_failed";
    const access = Number(payload.currentRevisions?.access);
    this.currentRevisions = Number.isSafeInteger(access) && access > 0 ? { access } : null;
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

function authorization(pathname: string, sessionStorage: Storage) {
  return publicPlanAuthorization(pathname, sessionStorage) as Record<string, string>;
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
