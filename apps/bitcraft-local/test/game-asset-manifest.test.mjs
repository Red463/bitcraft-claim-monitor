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

test("asset manifest verifies permission, identity, local files, and SHA-256 digests", () => {
  assert.ok(assetManifestModule, "asset manifest validator module must exist");
  const root = mkdtempSync(join(tmpdir(), "bitcraft-game-assets-"));
  try {
    const relativePath = "game-icons/GeneratedIcons/Items/Basic Axe.webp";
    const bytes = Buffer.from("approved-icon");
    mkdirSync(join(root, "game-icons", "GeneratedIcons", "Items"), { recursive: true });
    writeFileSync(join(root, ...relativePath.split("/")), bytes);

    const result = assetManifestModule.validateGameAssetManifest({
      version: 1,
      permissionReference: "legal/bitjita-icon-permission-2026-07-29.pdf",
      assets: [{
        catalogKey: "items:100",
        originalUrl: "https://bitjita.com/GeneratedIcons/Items/Basic%20Axe.webp",
        localPath: relativePath,
        sha256: sha256(bytes),
        retrievedAt: "2026-07-29T12:00:00.000Z",
      }],
    }, root);

    assert.deepEqual(result, { assetCount: 1, permissionReference: "legal/bitjita-icon-permission-2026-07-29.pdf" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("asset manifest rejects digest mismatches, duplicate identities, and path traversal", () => {
  assert.ok(assetManifestModule, "asset manifest validator module must exist");
  const root = mkdtempSync(join(tmpdir(), "bitcraft-game-assets-invalid-"));
  try {
    mkdirSync(join(root, "game-icons"), { recursive: true });
    writeFileSync(join(root, "game-icons", "one.webp"), "one");

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
          sha256: sha256("one"),
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
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
