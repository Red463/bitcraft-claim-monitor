export type MapRendererMode = "external" | "native-beta" | "native";
export function mapRendererPolicy(mode: MapRendererMode, compatibilityUrl: string): { native: boolean; externalHref: string | null; externalLabel: string | null };
