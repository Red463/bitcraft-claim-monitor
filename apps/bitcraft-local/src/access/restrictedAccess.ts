import type { AppUser } from "../types/settings";

export type RestrictedAccessGuidance = {
  message: string;
  action: "discord-login" | "user-settings" | null;
};

export function restrictedAccessGuidance(
  decision: { mode?: string } | undefined,
  user: AppUser | null,
  discordLoginEnabled: boolean,
): RestrictedAccessGuidance {
  if (!user) {
    return discordLoginEnabled
      ? { message: "Sign in with Discord to check your access.", action: "discord-login" }
      : { message: "Discord sign-in is currently unavailable. Contact an administrator for access.", action: null };
  }

  if (decision?.mode === "verified") {
    if (user.characterStatus === "pending") {
      return { message: "Your character link is awaiting administrator approval.", action: null };
    }
    if (user.characterStatus === "rejected") {
      return {
        message: "Open User Settings, select your BitCraft character, and request approval again.",
        action: "user-settings",
      };
    }
    if (user.characterStatus !== "approved") {
      return {
        message: "Open User Settings, select your BitCraft character, and request approval.",
        action: "user-settings",
      };
    }
    return {
      message: "Your verified character does not currently have access. Contact an administrator.",
      action: null,
    };
  }

  if (decision?.mode === "specificUsers") {
    return {
      message: "Ask an administrator to add your Discord account to this page's allow list.",
      action: null,
    };
  }

  return { message: "Contact an administrator to request access.", action: null };
}
