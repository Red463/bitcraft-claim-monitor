function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeVisitorSecuritySettings(value = {}, options = {}) {
  const saved = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const submittedLicenseKey = typeof saved.geoipLicenseKey === "string" ? saved.geoipLicenseKey.trim() : "";
  const licenseKey = options.clearLicenseKey === true ? "" : submittedLicenseKey || String(options.previous?.geoipLicenseKey ?? "").trim();
  const provider = ["ipapi", "local", "disabled"].includes(String(saved.geoipProvider ?? "ipapi")) ? String(saved.geoipProvider ?? "ipapi") : "ipapi";
  const settings = {
    fullIpRetentionDays: Math.min(Math.max(Math.floor(toNumber(saved.fullIpRetentionDays) || 7), 1), 30),
    statsRetentionDays: Math.min(Math.max(Math.floor(toNumber(saved.statsRetentionDays) || 180), 30), 730),
    geoipProvider: provider,
    geoipCacheDays: Math.min(Math.max(Math.floor(toNumber(saved.geoipCacheDays) || 30), 1), 90),
    geoipSourceUrl: String(saved.geoipSourceUrl ?? "").trim(),
    geoipAccountId: String(saved.geoipAccountId ?? "").trim(),
    geoipLicenseKeyConfigured: Boolean(licenseKey),
  };
  if (options.includeSecrets) settings.geoipLicenseKey = licenseKey;
  return settings;
}
