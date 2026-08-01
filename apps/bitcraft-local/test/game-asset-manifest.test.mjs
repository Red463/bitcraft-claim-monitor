import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

let assetManifestModule = null;
try {
  assetManifestModule = await import("../src/server/game-data/assetManifest.ts");
} catch {
  // The first TDD run proves the validator is not present yet.
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function webpBytes(label) {
  return Buffer.concat([
    Buffer.from("RIFF"),
    Buffer.alloc(4),
    Buffer.from("WEBP"),
    Buffer.from(label),
  ]);
}

test("asset manifest verifies permission, identity, local files, and SHA-256 digests", () => {
  assert.ok(assetManifestModule, "asset manifest validator module must exist");
  const root = mkdtempSync(join(tmpdir(), "bitcraft-game-assets-"));
  try {
    const relativePath = "game-icons/GeneratedIcons/Items/Basic Axe.webp";
    const bytes = webpBytes("approved-icon");
    mkdirSync(join(root, "game-icons", "GeneratedIcons", "Items"), { recursive: true });
    writeFileSync(join(root, ...relativePath.split("/")), bytes);

    const result = assetManifestModule.validateGameAssetManifest({
      version: 1,
      permissionReference: "legal/bitjita-icon-permission-2026-07-29.pdf",
      assets: [{
        catalogKey: "items:100",
        catalogKeys: ["items:100", "items:101"],
        originalUrl: "https://bitjita.com/GeneratedIcons/Items/Basic%20Axe.webp",
        localPath: relativePath,
        sha256: sha256(bytes),
        retrievedAt: "2026-07-29T12:00:00.000Z",
      }],
      unavailable: [{
        catalogKeys: ["items:102"],
        originalUrl: "https://bitjita.com/GeneratedIcons/Items/Missing.webp",
        reason: "source-not-found",
        observedAt: "2026-07-29T12:00:00.000Z",
      }],
    }, root);

    assert.deepEqual(result, {
      assetCount: 1,
      catalogIdentityCount: 3,
      unavailableCount: 1,
      permissionReference: "legal/bitjita-icon-permission-2026-07-29.pdf",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("asset manifest rejects digest mismatches, duplicate identities, and path traversal", () => {
  assert.ok(assetManifestModule, "asset manifest validator module must exist");
  const root = mkdtempSync(join(tmpdir(), "bitcraft-game-assets-invalid-"));
  try {
    mkdirSync(join(root, "game-icons"), { recursive: true });
    const oneBytes = webpBytes("one");
    writeFileSync(join(root, "game-icons", "one.webp"), oneBytes);

    assert.throws(() => assetManifestModule.validateGameAssetManifest({
      version: 1,
      permissionReference: "permission.md",
      assets: [{
        catalogKey: "items:1",
        originalUrl: "https://bitjita.com/one.webp",
        localPath: "game-icons/one.webp",
        sha256: "0".repeat(64),
        retrievedAt: "2026-07-29T12:00:00.000Z",
      }],
    }, root), /digest mismatch/i);

    assert.throws(() => assetManifestModule.validateGameAssetManifest({
      version: 1,
      permissionReference: "permission.md",
      assets: [
        {
          catalogKey: "items:1",
          originalUrl: "https://bitjita.com/one.webp",
          localPath: "game-icons/one.webp",
          sha256: sha256(oneBytes),
          retrievedAt: "2026-07-29T12:00:00.000Z",
        },
        {
          catalogKey: "items:1",
          originalUrl: "https://bitjita.com/two.webp",
          localPath: "../two.webp",
          sha256: sha256("two"),
          retrievedAt: "2026-07-29T12:00:00.000Z",
        },
      ],
    }, root), /duplicate catalog identity|outside the public asset root/i);

    assert.throws(() => assetManifestModule.validateGameAssetManifest({
      version: 1,
      permissionReference: "permission.md",
      assets: [{
        catalogKey: "items:1",
        catalogKeys: ["items:1"],
        originalUrl: "https://bitjita.com/one.webp",
        localPath: "game-icons/one.webp",
        sha256: sha256(oneBytes),
        retrievedAt: "2026-07-29T12:00:00.000Z",
      }],
      unavailable: [{
        catalogKeys: ["items:1"],
        originalUrl: "https://bitjita.com/missing.webp",
        reason: "source-not-found",
        observedAt: "2026-07-29T12:00:00.000Z",
      }],
    }, root), /duplicate catalog identity/i);

    writeFileSync(join(root, "game-icons", "not-webp.webp"), "not-a-webp");
    assert.throws(() => assetManifestModule.validateGameAssetManifest({
      version: 1,
      permissionReference: "permission.md",
      assets: [{
        catalogKey: "items:2",
        originalUrl: "https://bitjita.com/not-webp.webp",
        localPath: "game-icons/not-webp.webp",
        sha256: sha256("not-a-webp"),
        retrievedAt: "2026-07-29T12:00:00.000Z",
      }],
    }, root), /not a WebP/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
