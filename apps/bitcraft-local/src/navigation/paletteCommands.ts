import type { ActivePanel } from "../types/app";
import { routeHelpFor } from "./routeHelp.ts";

export type PaletteNavItem = readonly [ActivePanel, string, unknown];
export type PagePaletteCommand = {
  key: string;
  label: string;
  description: string;
  panel: ActivePanel;
  locked: boolean;
};

export function buildPagePaletteCommands(navItems: readonly PaletteNavItem[], allowedPages: ReadonlySet<ActivePanel>): PagePaletteCommand[] {
  return navItems.map(([panel, label]) => {
    const help = routeHelpFor(panel);
    const locked = !allowedPages.has(panel);
    return {
      key: `page-${panel}`,
      label,
      panel,
      locked,
      description: locked
        ? `${help?.purpose ?? "Administrator access is restricted."} Unavailable for your current access. Signing in or verifying your character does not guarantee access.`
        : `${help?.purpose ?? "Open this page."} ${help?.nextAction ?? "Continue with an available action."}`,
    };
  });
}

export function activatePagePaletteCommand(command: PagePaletteCommand | undefined, onNavigate: (panel: ActivePanel) => void) {
  if (!command || command.locked) return false;
  onNavigate(command.panel);
  return true;
}
