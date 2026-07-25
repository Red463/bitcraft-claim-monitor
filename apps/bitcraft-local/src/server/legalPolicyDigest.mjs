import { createHash } from "node:crypto";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("base64url");
}

export function legalPolicyDigests(policy) {
  const shared = {
    version: policy.version,
    effectiveDate: policy.effectiveDate,
    operator: policy.operator,
    providers: policy.providers,
  };
  return {
    termsDigest: digest({ ...shared, document: policy.terms }),
    privacyDigest: digest({ ...shared, retention: policy.retention, document: policy.privacy }),
  };
}
