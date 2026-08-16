function classifyBatchInstallReason(text) {
  const markedReason = /ROAD_REASON=(tile-budget|validation|collision|permission|disk|missing-path|closed|other|store-(?:preflight|prepare-root|create-staging|write-tiles|build-manifest|write-manifest|install-pack))/i.exec(text)?.[1]?.toLowerCase();
  if (markedReason) return markedReason;
  if (/tile exceeds (?:byte|read) budget/i.test(text)) return "tile-budget";
  if (/ENOSPC|no space left on device/i.test(text)) return "disk";
  if (/EACCES|EPERM|permission denied/i.test(text)) return "permission";
  if (/EEXIST|already (?:exists|installed)/i.test(text)) return "collision";
  if (/ENOENT|no such file or directory|missing tile/i.test(text)) return "missing-path";
  if (/tile store is closed|pack store is closed/i.test(text)) return "closed";
  if (/manifest|invalid tile path|tile (?:byte count|hash)|totals do not match/i.test(text)) return "validation";
  return "other";
}

export function classifyNativeMapUnitFailure(journal) {
  const text = String(journal ?? "");
  if (!text.trim()) return { category: "unavailable" };
  if (/ROAD_STAGE=(?:topology|relay-connect)/i.test(text)) return { category: "connection" };
  if (/ROAD_STAGE=relay-subscription/i.test(text)) return { category: "subscription" };
  if (/ROAD_STAGE=coordinate-projection/i.test(text)) return { category: "invalid-coordinate" };
  if (/ROAD_STAGE=tile-render/i.test(text)) return { category: "render" };
  const filesystemStage = /ROAD_STAGE=(batch-install|pack-compose|pack-install|pack-prune)/i.exec(text)?.[1]?.toLowerCase();
  if (filesystemStage === "batch-install") return { category: "filesystem", stage: filesystemStage, reason: classifyBatchInstallReason(text) };
  if (filesystemStage) return { category: "filesystem", stage: filesystemStage };
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
