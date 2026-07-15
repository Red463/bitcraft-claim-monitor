import type { ActivePanel } from "../types/app";
import { routeHelpFor } from "./routeHelp.ts";

export type PaletteNavItem<Icon = unknown> = readonly [ActivePanel, string, Icon];
export type PagePaletteCommand<Icon = unknown> = {
  key: string;
  label: string;
  description: string;
  panel: ActivePanel;
  locked: boolean;
  icon: Icon;
};

export function buildPagePaletteCommands<Icon>(navItems: readonly PaletteNavItem<Icon>[], allowedPages: ReadonlySet<ActivePanel>): PagePaletteCommand<Icon>[] {
  return navItems.map(([panel, label, icon]) => {
    const help = routeHelpFor(panel);
    const locked = !allowedPages.has(panel);
    return {
      key: `page-${panel}`,
      label,
      panel,
      locked,
      icon,
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
