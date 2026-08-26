export type BindingSchemaKind = "global" | "regional";

type BindingSchemaEntry = {
  fingerprint?: unknown;
  bindingsGenerated?: unknown;
};

type BindingSchemaManifest = {
  schemas?: Partial<Record<BindingSchemaKind, BindingSchemaEntry>>;
};

function normalizedFingerprint(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function assertSchemaFingerprint(
  manifest: BindingSchemaManifest,
  kind: BindingSchemaKind,
  observedFingerprint: string,
): string {
  const expected = normalizedFingerprint(manifest.schemas?.[kind]?.fingerprint);
  const observed = normalizedFingerprint(observedFingerprint);
  if (!expected || !observed || expected !== observed) {
    throw new Error(`Relay ${kind} schema fingerprint mismatch: expected ${expected || "unconfigured"}, observed ${observed || "missing"}`);
  }
  return observed;
}

export function schemaBindingsReady(
  manifest: BindingSchemaManifest,
  kind: BindingSchemaKind,
): boolean {
  return manifest.schemas?.[kind]?.bindingsGenerated === true;
}
