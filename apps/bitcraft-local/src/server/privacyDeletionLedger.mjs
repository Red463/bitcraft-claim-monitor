import { appendFileSync, closeSync, existsSync, fsyncSync, openSync, readFileSync } from "node:fs";
import { createHash, createHmac, randomUUID as cryptoRandomUUID, timingSafeEqual } from "node:crypto";

const RECORD_VERSION = 1;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function canonical(record) {
  return JSON.stringify({
    version: record.version,
    operationId: record.operationId,
    state: record.state,
    subject: record.subject,
    occurredAt: record.occurredAt,
    expiresAt: record.expiresAt,
    keyId: record.keyId,
  });
}

export function deletionLedgerKeyId(key) {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export function deletionLedgerSubject(discordId, key) {
  return createHmac("sha256", key).update(`discord:${String(discordId)}`).digest("base64url");
}

export function signDeletionLedgerRecord(record, key) {
  const unsigned = { ...record, keyId: deletionLedgerKeyId(key) };
  return {
    ...unsigned,
    signature: createHmac("sha256", key).update(canonical(unsigned)).digest("base64url"),
  };
}

export function verifyDeletionLedgerRecord(record, keys) {
  const key = keys.find((candidate) => deletionLedgerKeyId(candidate) === String(record?.keyId ?? ""));
  if (!key || Number(record?.version) !== RECORD_VERSION) return false;
  const expected = createHmac("sha256", key).update(canonical(record)).digest();
  let supplied;
  try {
    supplied = Buffer.from(String(record.signature ?? ""), "base64url");
  } catch {
    return false;
  }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function readDeletionLedger(path, keys) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean);
  return lines.map((line) => JSON.parse(line)).map((record) => {
    if (!verifyDeletionLedgerRecord(record, keys)) throw new Error("Privacy deletion ledger verification failed");
    return record;
  });
}

export function appendDeletionLedgerRecord(path, record, key) {
  const signed = signDeletionLedgerRecord(record, key);
  appendFileSync(path, `${JSON.stringify(signed)}\n`, { encoding: "utf8", mode: 0o600 });
  const descriptor = openSync(path, "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return signed;
}

export function coordinatePrivacyDeletion({
  ledgerPath,
  key,
  discordId,
  deleteAccount,
  now = () => new Date(),
  randomUUID = cryptoRandomUUID,
}) {
  const operationId = randomUUID();
  const occurredAt = now();
  const base = {
    version: RECORD_VERSION,
    operationId,
    subject: deletionLedgerSubject(discordId, key),
    occurredAt: occurredAt.toISOString(),
    expiresAt: new Date(occurredAt.getTime() + RETENTION_MS).toISOString(),
  };
  appendDeletionLedgerRecord(ledgerPath, { ...base, state: "pending" }, key);
  let result;
  try {
    result = deleteAccount(operationId);
  } catch (error) {
    appendDeletionLedgerRecord(ledgerPath, { ...base, state: "aborted", occurredAt: now().toISOString() }, key);
    throw error;
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      appendDeletionLedgerRecord(ledgerPath, { ...base, state: "committed", occurredAt: now().toISOString() }, key);
      return result;
    } catch (error) {
      lastError = error;
    }
  }
  const integrityError = new Error("Account data was deleted but the privacy recovery marker could not be finalized");
  integrityError.code = "privacy_integrity_failure";
  integrityError.cause = lastError;
  throw integrityError;
}

export function committedDeletionSubjects(records, now = new Date()) {
  const state = new Map();
  for (const record of records) state.set(record.operationId, record);
  return new Set([...state.values()]
    .filter((record) => record.state === "committed" && Date.parse(record.expiresAt) > now.getTime())
    .map((record) => record.subject));
}

export function replayPrivacyDeletions({ records, accounts, key, keys = [key], deleteAccount, now = new Date() }) {
  const subjects = committedDeletionSubjects(records, now);
  let deleted = 0;
  for (const account of accounts) {
    if (!keys.some((candidate) => subjects.has(deletionLedgerSubject(account.discordId, candidate)))) continue;
    deleteAccount(account);
    deleted += 1;
  }
  return { deleted };
}
