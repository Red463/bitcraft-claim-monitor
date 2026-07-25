#!/usr/bin/env node
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const MAGIC = Buffer.from("BCMENC01", "ascii");

function keyFromFile(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Encryption key must be a regular non-symlink file");
  if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) throw new Error("Encryption key must not be group/world accessible");
  const encoded = readFileSync(path, "utf8").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) throw new Error("Encryption key must be one base64url-encoded 32-byte value");
  const key = Buffer.from(encoded, "base64url");
  if (key.length !== 32) throw new Error("Encryption key must decode to exactly 32 bytes");
  return key;
}

function encrypt(input, output, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(MAGIC);
  const ciphertext = Buffer.concat([cipher.update(readFileSync(input)), cipher.final()]);
  const tag = cipher.getAuthTag();
  writeFileSync(output, Buffer.concat([MAGIC, nonce, tag, ciphertext]), { flag: "wx", mode: 0o600 });
}

function decrypt(input, output, key) {
  const payload = readFileSync(input);
  if (payload.length < MAGIC.length + 12 + 16 || !payload.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Encrypted backup header is invalid");
  }
  const nonce = payload.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = payload.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const ciphertext = payload.subarray(MAGIC.length + 28);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  writeFileSync(output, plaintext, { flag: "wx", mode: 0o600 });
}

const [mode, input, output, keyFile] = process.argv.slice(2);
if (!["encrypt", "decrypt"].includes(mode) || !input || !output || !keyFile) {
  console.error("Usage: backup-crypto.mjs <encrypt|decrypt> <input> <output> <key-file>");
  process.exit(2);
}

try {
  const key = keyFromFile(keyFile);
  if (mode === "encrypt") encrypt(input, output, key);
  else decrypt(input, output, key);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
