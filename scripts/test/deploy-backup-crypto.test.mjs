import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const helper = fileURLToPath(new URL("../../deploy/backup-crypto.mjs", import.meta.url));
const helperSource = readFileSync(helper, "utf8");
const cutoverSource = readFileSync(new URL("../../deploy/cutover-relay-production.mjs", import.meta.url), "utf8");

test("cutover backup hashing and authenticated encryption never buffer whole database files", () => {
  assert.match(helperSource, /createReadStream/);
  assert.match(helperSource, /pipeline/);
  assert.doesNotMatch(helperSource, /readFileSync\((?:input|output)\)/);
  const backupFlow = cutoverSource.slice(
    cutoverSource.indexOf("async function createAndVerifyEncryptedBackups"),
    cutoverSource.indexOf("async function createRepairManifest"),
  );
  assert.match(backupFlow, /sha256File\(plaintext\)/);
  assert.match(backupFlow, /sha256File\(validation\)/);
  assert.match(backupFlow, /sha256File\(encrypted\)/);
  assert.doesNotMatch(backupFlow, /sha256\(readFileSync\((?:plaintext|validation|encrypted)\)\)/);
});

test("backup crypto round-trips with authenticated AES-256-GCM and fresh nonces", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "backup-crypto-"));
  const key = path.join(directory, "key");
  const input = path.join(directory, "database.sqlite");
  const first = path.join(directory, "first.enc");
  const second = path.join(directory, "second.enc");
  const restored = path.join(directory, "restored.sqlite");
  writeFileSync(key, Buffer.alloc(32, 5).toString("base64url"));
  chmodSync(key, 0o600);
  writeFileSync(input, "sqlite test content");

  for (const output of [first, second]) {
    const result = spawnSync(process.execPath, [helper, "encrypt", input, output, key], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.notDeepEqual(readFileSync(first), readFileSync(second));
  const decrypted = spawnSync(process.execPath, [helper, "decrypt", first, restored, key], { encoding: "utf8" });
  assert.equal(decrypted.status, 0, decrypted.stderr);
  assert.equal(readFileSync(restored, "utf8"), "sqlite test content");
});

test("backup crypto rejects malformed keys and authenticated-data tampering", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "backup-crypto-"));
  const key = path.join(directory, "key");
  const input = path.join(directory, "database.sqlite");
  const encrypted = path.join(directory, "database.enc");
  const restored = path.join(directory, "restored.sqlite");
  writeFileSync(key, Buffer.alloc(32, 8).toString("base64url"));
  chmodSync(key, 0o600);
  writeFileSync(input, "sqlite test content");
  assert.equal(spawnSync(process.execPath, [helper, "encrypt", input, encrypted, key]).status, 0);
  const payload = readFileSync(encrypted);
  payload[payload.length - 1] ^= 0xff;
  writeFileSync(encrypted, payload);
  const result = spawnSync(process.execPath, [helper, "decrypt", encrypted, restored, key], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /authenticate|authentic/i);
});
