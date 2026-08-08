import { formatDecimalQuantity } from "../../server/game-data/inventoryProjection.ts";

export function passiveCraftQuantityLabel(value: unknown): string {
  return value == null ? "Unavailable" : formatDecimalQuantity(value);
}
