const STALE_LEGAL_ALLOWLIST = new Set([
  "POST /api/local/auth/legal/accept",
  "GET /api/local/auth/privacy/export",
  "POST /api/local/auth/privacy/reauth/start",
  "DELETE /api/local/auth/privacy/account",
  "POST /api/local/auth/logout",
]);

export function currentLegalSnapshot(policy, digests) {
  return {
    version: String(policy.version),
    termsDigest: String(digests.termsDigest),
    privacyDigest: String(digests.privacyDigest),
  };
}

export function isCurrentLegalAcceptance(row, expected) {
  return Boolean(row)
    && String(row.legal_version) === expected.version
    && String(row.terms_digest) === expected.termsDigest
    && String(row.privacy_digest) === expected.privacyDigest
    && Number(row.age_confirmed) === 1;
}

export function publicLegalStatus(row, expected) {
  const current = isCurrentLegalAcceptance(row, expected);
  return {
    ...expected,
    acceptedAt: current ? String(row.accepted_at) : null,
    requiresAcceptance: !current,
  };
}

export function routeAllowedWithoutCurrentAcceptance(method, pathname) {
  return STALE_LEGAL_ALLOWLIST.has(`${String(method).toUpperCase()} ${String(pathname)}`);
}
