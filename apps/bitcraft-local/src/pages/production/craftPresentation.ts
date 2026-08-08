import type { AnyRecord } from "../../main-app-data.ts";
import { explicitInventoryStackKey } from "../../server/game-data/inventoryProjection.ts";

function catalogEntity(outputIdentity: string | null, payload: AnyRecord): AnyRecord | null {
  if (!outputIdentity) return null;
  const projected = payload.catalog?.[outputIdentity];
  if (projected && typeof projected === "object") return projected as AnyRecord;
  const [kind, itemId] = outputIdentity.split(":");
  const rows = kind === "cargo" ? payload.cargos : payload.items;
  return (Array.isArray(rows)
    ? rows.find((candidate: AnyRecord) => String(candidate.id ?? candidate.itemId ?? "") === itemId)
    : null) ?? null;
}

function resolvedRecipeName(value: unknown, outputName: string): string {
  const recipeName = String(value ?? "").trim();
  if (!recipeName) return outputName;
  return recipeName.replaceAll("{0}", outputName).replace(/\s+/g, " ").trim();
}

export function projectCraftPresentation(job: AnyRecord, payload: AnyRecord = {}) {
  const output = Array.isArray(job.craftedItem) ? job.craftedItem[0] : null;
  let outputIdentity: string | null = null;
  if (output && typeof output === "object") {
    try {
      outputIdentity = explicitInventoryStackKey(output);
    } catch {
      // Partial Relay craft rows must remain renderable while their output is unavailable.
    }
  }
  const [kind, outputItemId = null] = outputIdentity?.split(":") ?? [];
  const item = catalogEntity(outputIdentity, payload);
  const partialOutputIdentity = Boolean(output) && outputIdentity === null;
  const outputItemType = kind === "cargo" ? "cargo" : kind === "items" ? "item" : null;
  const outputName = partialOutputIdentity
    ? "crafted item"
    : String(item?.name
      ?? job.outputName
      ?? job.itemName
      ?? (outputItemId ? `${outputItemType === "cargo" ? "Cargo" : "Item"} #${outputItemId}` : "crafted item"));
  return {
    outputIdentity,
    outputItemType,
    outputItemId,
    outputName,
    recipeName: resolvedRecipeName(job.recipeName ?? job.name, outputName),
    displayName: outputName,
    iconAssetName: item?.iconAssetName ?? job.iconAssetName ?? null,
    item: item ?? {
      ...(outputItemId ? { id: outputItemId, itemId: outputItemId, itemType: outputItemType } : {}),
      name: outputName,
      tier: partialOutputIdentity ? null : job.tier ?? job.itemTier ?? null,
      iconAssetName: job.iconAssetName ?? null,
    },
  };
}
