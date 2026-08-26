export type FrontendProfileId = "timbersteel" | "public";

export type FrontendProfile = {
  id: FrontendProfileId;
  origin: string;
  allowsAdmin: boolean;
  allowsDiscord: boolean;
  features: {
    publicProfileEnabled: boolean;
    publicCollaborationEnabled: boolean;
    publicLegalConfigurationConfirmed: boolean;
  };
};

type FrontendProfileFeatures = FrontendProfile["features"];

type ProfileResponse = {
  profile?: Record<string, unknown>;
  features?: Record<string, unknown>;
};

type ProfileFetch = (input: string, init: { cache: RequestCache; signal?: AbortSignal }) => Promise<{
  ok: boolean;
  status?: number;
  json(): Promise<unknown>;
}>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function profileFromResponse(value: unknown): FrontendProfile {
  const response = record(value) as ProfileResponse;
  const profile = record(response.profile);
  const features = record(response.features);
  if (
    typeof features.publicProfileEnabled !== "boolean"
    || typeof features.publicCollaborationEnabled !== "boolean"
    || typeof features.publicLegalConfigurationConfirmed !== "boolean"
  ) throw new Error("Profile response features were invalid.");
  const normalizedFeatures: FrontendProfileFeatures = {
    publicProfileEnabled: features.publicProfileEnabled,
    publicCollaborationEnabled: features.publicCollaborationEnabled,
    publicLegalConfigurationConfirmed: features.publicLegalConfigurationConfirmed,
  };
  if (profile.id === "timbersteel" && profile.origin === "https://app.timbersteeltrade.com" && profile.allowsAdmin === true && profile.allowsDiscord === true) {
    return { id: "timbersteel", origin: profile.origin, allowsAdmin: true, allowsDiscord: true, features: normalizedFeatures };
  }
  if (profile.id === "public" && profile.origin === "https://claim-monitor.com" && profile.allowsAdmin === false && profile.allowsDiscord === false) {
    return { id: "public", origin: profile.origin, allowsAdmin: false, allowsDiscord: false, features: normalizedFeatures };
  }
  throw new Error("Profile response was invalid.");
}

export async function loadHostProfile(fetchImpl: ProfileFetch = fetch, signal?: AbortSignal): Promise<FrontendProfile> {
  const response = await fetchImpl("/api/profile", { cache: "no-store", signal });
  if (!response.ok) throw new Error(`Profile request failed with HTTP ${response.status ?? 0}.`);
  return profileFromResponse(await response.json());
}

// This selects a frontend bundle only. Every request remains authorized by
// the server-side host profile boundary.
export function rootForProfile(profile: Pick<FrontendProfile, "id">): FrontendProfileId {
  return profile.id;
}
