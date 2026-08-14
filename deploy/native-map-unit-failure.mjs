export function classifyNativeMapUnitFailure(journal) {
  const text = String(journal ?? "");
  if (!text.trim()) return { category: "unavailable" };
  if (/ROAD_STAGE=(?:topology|relay-connect)/i.test(text)) return { category: "connection" };
  if (/ROAD_STAGE=relay-subscription/i.test(text)) return { category: "subscription" };
  if (/ROAD_STAGE=coordinate-projection/i.test(text)) return { category: "invalid-coordinate" };
  if (/ROAD_STAGE=tile-render/i.test(text)) return { category: "render" };
  if (/ROAD_STAGE=(?:batch-install|pack-compose|pack-install|pack-prune)/i.test(text)) return { category: "filesystem" };
  if (/returned no verified paving points/i.test(text)) return { category: "empty-region" };
  if (/missing location data/i.test(text)) return { category: "join-mismatch" };
  if (/timed out/i.test(text)) return { category: "timeout" };
  if (/schema fingerprint|schema-compatible|schema mismatch/i.test(text)) return { category: "schema" };
  if (/impossible coordinates|unexpected dimension/i.test(text)) return { category: "invalid-coordinate" };
  if (/heap out of memory|allocation failed|out of memory|oom-kill|status=9\/kill/i.test(text)) return { category: "out-of-memory" };
  if (/subscription|subscribe|\bsql\b|query rejected|unsupported.*join|paved_tile_state|location_state/i.test(text)) return { category: "subscription" };
  if (/websocket|connect(?:ion)? (?:error|failed)|failed to connect/i.test(text)) return { category: "connection" };
  if (/err_module_not_found|cannot find module|regional bindings/i.test(text)) return { category: "module" };
  if (/\beacces\b|permission denied|read-only file system/i.test(text)) return { category: "filesystem" };
  if (/\benospc\b|no space left on device/i.test(text)) return { category: "disk" };
  if (/\bpng\b|\bcanvas\b|render failed/i.test(text)) return { category: "render" };
  if (/\bflock\b.*(?:failed|unavailable)|resource temporarily unavailable/i.test(text)) return { category: "busy" };
  if (/typeerror|referenceerror|cannot read properties/i.test(text)) return { category: "implementation" };
  return { category: "other" };
}
