import type { AnyRecord } from "../../main-app-data.ts";
import { inventoryStackKey } from "../../server/game-data/inventoryProjection.ts";

function catalogEntity(outputIdentity: string, payload: AnyRecord): AnyRecord | null {
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
  const output = Array.isArray(job.craftedItem) ? job.craftedItem[0] ?? {} : {};
  const outputIdentity = inventoryStackKey(output);
  const [kind, outputItemId] = outputIdentity.split(":");
  const item = catalogEntity(outputIdentity, payload);
  const outputItemType = kind === "cargo" ? "cargo" : "item";
  const outputName = String(
    item?.name
      ?? job.outputName
      ?? job.itemName
      ?? `${outputItemType === "cargo" ? "Cargo" : "Item"} #${outputItemId}`,
  );
  return {
    outputIdentity,
    outputItemType,
    outputItemId,
    outputName,
    recipeName: resolvedRecipeName(job.recipeName ?? job.name, outputName),
    displayName: outputName,
    iconAssetName: item?.iconAssetName ?? job.iconAssetName ?? null,
    item: item ?? {
      id: outputItemId,
      itemId: outputItemId,
      itemType: outputItemType,
      name: outputName,
      tier: job.tier ?? job.itemTier ?? null,
      iconAssetName: job.iconAssetName ?? null,
    },
  };
}
