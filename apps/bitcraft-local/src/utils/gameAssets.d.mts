export type GameAssetIdentity = {
  id?: unknown;
  itemId?: unknown;
  item_id?: unknown;
  itemType?: unknown;
  item_type?: unknown;
  kind?: unknown;
  iconAssetName?: unknown;
  icon_asset_name?: unknown;
  iconAddress?: unknown;
  icon_address?: unknown;
  contents?: GameAssetIdentity | null;
};

export declare function gameIconUrl(item: GameAssetIdentity | null | undefined): string | null;
export declare function gameIconSources(item: GameAssetIdentity | null | undefined): string[];
