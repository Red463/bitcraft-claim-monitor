import type { AppSettings } from "../../types/settings";

export function syncDraftFromPersistedSettings(
  previousSettings: AppSettings,
  nextSettings: AppSettings,
  draft: AppSettings,
): AppSettings {
  return JSON.stringify(draft) === JSON.stringify(previousSettings) ? nextSettings : draft;
}

export function applyBrandingSettingsResult(
  persistedSettings: AppSettings,
  draft: AppSettings,
  branding: AppSettings["branding"],
): { savedSettings: AppSettings; nextDraft: AppSettings } {
  return {
    savedSettings: { ...persistedSettings, branding },
    nextDraft: { ...draft, branding },
  };
}

export function applyConfirmedSettingsSave({
  previousSettings,
  persistedSettings,
  onSettingsSaved,
  onClaimSettingsSaved,
}: {
  previousSettings: AppSettings;
  persistedSettings: AppSettings;
  onSettingsSaved: (settings: AppSettings) => void;
  onClaimSettingsSaved?: (previousClaimId: string, settings: AppSettings) => void;
}): void {
  onSettingsSaved(persistedSettings);
  if (previousSettings.claimId !== persistedSettings.claimId) {
    onClaimSettingsSaved?.(previousSettings.claimId, persistedSettings);
  }
}
