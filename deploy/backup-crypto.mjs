#!/usr/bin/env node
import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  writeSync,
} from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("BCMENC01", "ascii");
const HEADER_LENGTH = MAGIC.length + 12 + 16;

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

function readHeader(input) {
  const descriptor = openSync(input, "r");
  try {
    const header = Buffer.alloc(HEADER_LENGTH);
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length
      || !header.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error("Encrypted backup header is invalid");
    }
    return header;
  } finally {
    closeSync(descriptor);
  }
}

async function encrypt(input, output, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(MAGIC);
  const descriptor = openSync(output, "wx", 0o600);
  try {
    writeSync(descriptor, Buffer.alloc(HEADER_LENGTH), 0, HEADER_LENGTH, 0);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    await pipeline(
      createReadStream(input),
      cipher,
      createWriteStream(output, { flags: "r+", start: HEADER_LENGTH }),
    );
    const header = Buffer.concat([MAGIC, nonce, cipher.getAuthTag()]);
    const headerDescriptor = openSync(output, "r+");
    try {
      writeSync(headerDescriptor, header, 0, header.length, 0);
      fsyncSync(headerDescriptor);
    } finally {
      closeSync(headerDescriptor);
    }
  } catch (error) {
    if (existsSync(output)) rmSync(output);
    throw error;
  }
}

async function decrypt(input, output, key) {
  const header = readHeader(input);
  const nonce = header.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = header.subarray(MAGIC.length + 12, HEADER_LENGTH);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    await pipeline(
      createReadStream(input, { start: HEADER_LENGTH }),
      decipher,
      createWriteStream(output, { flags: "wx", mode: 0o600 }),
    );
  } catch (error) {
    if (existsSync(output)) rmSync(output);
    throw error;
  }
}

const [mode, input, output, keyFile] = process.argv.slice(2);
if (!["encrypt", "decrypt"].includes(mode) || !input || !output || !keyFile) {
  console.error("Usage: backup-crypto.mjs <encrypt|decrypt> <input> <output> <key-file>");
  process.exit(2);
}

try {
  const key = keyFromFile(keyFile);
  if (mode === "encrypt") await encrypt(input, output, key);
  else await decrypt(input, output, key);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
