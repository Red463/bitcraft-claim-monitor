export type NativeMapPaneTarget = Readonly<{
  style: Pick<CSSStyleDeclaration, "zIndex">;
}>;

export const NATIVE_MAP_PANE_Z_INDEX: Readonly<{
  resources: 550;
  markers: 600;
  players: 700;
  tooltips: 750;
}>;

export function applyNativeMapPaneOrder(panes: Readonly<{
  resources: NativeMapPaneTarget | null | undefined;
  markers: NativeMapPaneTarget | null | undefined;
  players: NativeMapPaneTarget | null | undefined;
  tooltips: NativeMapPaneTarget | null | undefined;
}>): void;
