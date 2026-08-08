import type { ActivePanel } from "../types/app.ts";

const DASHBOARD_OWNER_ENRICHMENT_WARNING =
  /^region-claims: Regional claims missing owner usernames: \d+\.$/;

export function pageGameDataWarnings(
  activePanel: ActivePanel,
  warnings: string[],
): string[] {
  if (activePanel !== "dashboard") return warnings;
  return warnings.filter(
    (warning) => !DASHBOARD_OWNER_ENRICHMENT_WARNING.test(warning),
  );
}

export function staleDataWarning(options: {
  stale: boolean;
  refreshActive: boolean;
  lastUpdatedLabel: string | null;
}): string {
  if (!options.stale) return "";
  const savedAt = options.lastUpdatedLabel ? ` from ${options.lastUpdatedLabel}` : "";
  return options.refreshActive
    ? `Showing saved data${savedAt} while refresh continues.`
    : `Showing saved data${savedAt}; live refresh is unavailable.`;
}
