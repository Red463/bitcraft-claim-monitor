export const NATIVE_MAP_PANE_Z_INDEX = Object.freeze({
  resources: 550,
  markers: 600,
  players: 700,
  tooltips: 750,
});

export function applyNativeMapPaneOrder(panes) {
  for (const [name, zIndex] of Object.entries(NATIVE_MAP_PANE_Z_INDEX)) {
    const pane = panes?.[name];
    if (!pane?.style) throw new TypeError(`Native map ${name} pane is unavailable`);
    pane.style.zIndex = String(zIndex);
  }
}
