import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

type GameAssetManifestEntry = {
  catalogKey?: unknown;
  catalogKeys?: unknown;
  originalUrl?: unknown;
  localPath?: unknown;
  sha256?: unknown;
  retrievedAt?: unknown;
};

type UnavailableGameAssetManifestEntry = {
  catalogKeys?: unknown;
  originalUrl?: unknown;
  reason?: unknown;
  observedAt?: unknown;
};

type GameAssetManifest = {
  version?: unknown;
  permissionReference?: unknown;
  assets?: unknown;
  unavailable?: unknown;
};

function requiredText(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`Game asset manifest ${label} is required`);
  return normalized;
}

function validatedLocalPath(value: unknown, publicRoot: string): { localPath: string; absolutePath: string } {
  const localPath = requiredText(value, "localPath").replaceAll("\\", "/");
  if (!localPath.startsWith("game-icons/") || !/\.webp$/i.test(localPath)) {
    throw new Error(`Game asset ${localPath} must be a WebP file under game-icons/`);
  }
  const absolutePath = resolve(publicRoot, ...localPath.split("/"));
  const relativePath = relative(resolve(publicRoot), absolutePath);
  if (!relativePath || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Game asset ${localPath} resolves outside the public asset root`);
  }
  return { localPath, absolutePath };
}

function validatedDigest(value: unknown, catalogKey: string): string {
  const digest = requiredText(value, `sha256 for ${catalogKey}`).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`Game asset ${catalogKey} has an invalid SHA-256 digest`);
  }
  return digest;
}

function validatedUrl(value: unknown, label: string): string {
  const originalUrl = requiredText(value, label);
  let parsedOriginalUrl: URL;
  try {
    parsedOriginalUrl = new URL(originalUrl);
  } catch {
    throw new Error(`Game asset ${label} is invalid`);
  }
  if (parsedOriginalUrl.protocol !== "https:") {
    throw new Error(`Game asset ${label} must use HTTPS`);
  }
  return originalUrl;
}

function validatedDate(value: unknown, label: string): string {
  const date = requiredText(value, label);
  if (!Number.isFinite(Date.parse(date))) {
    throw new Error(`Game asset ${label} is invalid`);
  }
  return date;
}

function validatedCatalogKeys(
  value: unknown,
  fallback: unknown,
  knownCatalogKeys: Set<string>,
): string[] {
  const rawKeys = Array.isArray(value) ? value : [fallback];
  if (!rawKeys.length) throw new Error("Game asset catalogKeys must not be empty");
  const catalogKeys = rawKeys.map((rawKey) => requiredText(rawKey, "catalogKey"));
  for (const catalogKey of catalogKeys) {
    if (knownCatalogKeys.has(catalogKey)) {
      throw new Error(`Duplicate catalog identity in game asset manifest: ${catalogKey}`);
    }
    knownCatalogKeys.add(catalogKey);
  }
  return catalogKeys;
}

export function validateGameAssetManifest(
  manifest: GameAssetManifest,
  publicRoot: string,
): {
  assetCount: number;
  catalogIdentityCount: number;
  unavailableCount: number;
  permissionReference: string;
} {
  if (manifest?.version !== 1) throw new Error("Game asset manifest version must be 1");
  const permissionReference = requiredText(manifest.permissionReference, "permissionReference");
  if (!Array.isArray(manifest.assets)) throw new Error("Game asset manifest assets must be an array");

  const catalogKeys = new Set<string>();
  const localPaths = new Set<string>();
  for (const rawEntry of manifest.assets as GameAssetManifestEntry[]) {
    const entryCatalogKeys = validatedCatalogKeys(
      rawEntry?.catalogKeys,
      rawEntry?.catalogKey,
      catalogKeys,
    );
    const catalogKey = entryCatalogKeys[0];
    validatedUrl(rawEntry?.originalUrl, `originalUrl for ${catalogKey}`);

    const { localPath, absolutePath } = validatedLocalPath(rawEntry?.localPath, publicRoot);
    if (localPaths.has(localPath)) {
      throw new Error(`Duplicate local path in game asset manifest: ${localPath}`);
    }
    localPaths.add(localPath);

    validatedDate(rawEntry?.retrievedAt, `retrievedAt for ${catalogKey}`);

    const expectedDigest = validatedDigest(rawEntry?.sha256, catalogKey);
    let fileBytes: Buffer;
    try {
      fileBytes = readFileSync(absolutePath);
    } catch {
      throw new Error(`Game asset file is missing: ${localPath}`);
    }
    const observedDigest = createHash("sha256").update(fileBytes).digest("hex");
    if (observedDigest !== expectedDigest) {
      throw new Error(`Game asset digest mismatch for ${catalogKey}: expected ${expectedDigest}, observed ${observedDigest}`);
    }
    if (
      fileBytes.length < 12
      || fileBytes.subarray(0, 4).toString("ascii") !== "RIFF"
      || fileBytes.subarray(8, 12).toString("ascii") !== "WEBP"
    ) {
      throw new Error(`Game asset ${catalogKey} is not a WebP file`);
    }
  }

  const unavailable = manifest.unavailable ?? [];
  if (!Array.isArray(unavailable)) {
    throw new Error("Game asset manifest unavailable must be an array");
  }
  for (const rawEntry of unavailable as UnavailableGameAssetManifestEntry[]) {
    const entryCatalogKeys = validatedCatalogKeys(rawEntry?.catalogKeys, undefined, catalogKeys);
    const catalogKey = entryCatalogKeys[0];
    validatedUrl(rawEntry?.originalUrl, `originalUrl for ${catalogKey}`);
    if (requiredText(rawEntry?.reason, `reason for ${catalogKey}`) !== "source-not-found") {
      throw new Error(`Game asset ${catalogKey} has an unsupported unavailable reason`);
    }
    validatedDate(rawEntry?.observedAt, `observedAt for ${catalogKey}`);
  }

  return {
    assetCount: manifest.assets.length,
    catalogIdentityCount: catalogKeys.size,
    unavailableCount: unavailable.length,
    permissionReference,
  };
}
