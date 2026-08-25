export type PublicAccount = {
  id: number;
  discordId: string;
  username: string;
  globalName: string;
  avatarUrl: string | null;
  settings: Record<string, unknown>;
  createdAt: string;
  lastLoginAt: string | null;
};

export type PublicLegalStatus = {
  version: string;
  termsDigest: string;
  privacyDigest: string;
  acceptedAt: string | null;
  requiresAcceptance: boolean;
};

export type PublicSession = {
  user: PublicAccount | null;
  csrfToken: string | null;
  discordLoginEnabled: boolean;
  legal: PublicLegalStatus;
};

export type PublicLegalSection = { id: string; title: string; paragraphs: string[]; bullets?: string[] };
export type PublicLegalPolicy = {
  version: string;
  effectiveDate: string;
  operator: { projectName: string; controllerName: string; privacyEmail: string; minimumAge: number };
  providers: Array<{ key: string; name: string; role: string; data: string; location: string }>;
  retention: Array<{ key: string; label: string; rule: string }>;
  terms: { title: string; sections: PublicLegalSection[] };
  privacy: { title: string; sections: PublicLegalSection[] };
};

type FetchLike = (input: string, init: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

async function publicJson<T>(path: string, init: RequestInit = {}, fetchImpl: FetchLike = fetch): Promise<T> {
  const response = await fetchImpl(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  const payload = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(payload.error || `Public account request failed with HTTP ${response.status}.`);
  return payload;
}

function mutation(body: unknown, csrfToken?: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
    body: JSON.stringify(body),
  };
}

export function loadPublicSession(fetchImpl: FetchLike = fetch) {
  return publicJson<PublicSession>("/api/public/auth/session", {}, fetchImpl);
}

export function loadPublicLegal(fetchImpl: FetchLike = fetch) {
  return publicJson<PublicLegalPolicy>("/api/public/legal", {}, fetchImpl);
}

export function startPublicDiscordLogin(
  input: { acceptedTerms: boolean; ageConfirmed: boolean; returnTo: string },
  fetchImpl: FetchLike = fetch,
) {
  return publicJson<{ authorizeUrl: string }>("/api/public/auth/discord/start", mutation(input), fetchImpl);
}

export function acceptPublicLegal(csrfToken: string, fetchImpl: FetchLike = fetch) {
  return publicJson<PublicSession>(
    "/api/public/auth/legal/accept",
    mutation({ acceptedTerms: true, ageConfirmed: true }, csrfToken),
    fetchImpl,
  );
}

export function logoutPublicSession(csrfToken: string, fetchImpl: FetchLike = fetch) {
  return publicJson<{ ok: true }>("/api/public/auth/logout", mutation({}, csrfToken), fetchImpl);
}

export function startPublicPrivacyReauthentication(csrfToken: string, fetchImpl: FetchLike = fetch) {
  return publicJson<{ authorizeUrl: string }>(
    "/api/public/auth/privacy/reauth/start",
    mutation({}, csrfToken),
    fetchImpl,
  );
}

export function reviewPublicDeletion(csrfToken: string, fetchImpl: FetchLike = fetch) {
  return publicJson<{
    ok: true;
    recentlyReauthenticated: true;
    canDelete: false;
    planDispositionReviewRequired: true;
  }>("/api/public/auth/privacy/deletion-preflight", mutation({}, csrfToken), fetchImpl);
}
