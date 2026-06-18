export const DEFAULT_BITCRAFT_AUTH_ORIGIN = "https://api.bitcraftonline.com";
export const DEFAULT_SPACETIME_HOST = "https://bitcraft-early-access.spacetimedb.com";
export const DEFAULT_GLOBAL_DATABASE = "bitcraft-live-global";
export const DEFAULT_SCHEMA_VERSION = "9";
export const SPACETIME_JSON_PROTOCOL = "v1.json.spacetimedb";

export function normalizeHost(host) {
  const value = String(host ?? "").trim();
  if (!value) return "";
  return value.replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://").replace(/\/+$/, "");
}

export function httpToWsHost(host) {
  const value = normalizeHost(host);
  return value.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://");
}

export function redactToken(token) {
  const value = String(token ?? "");
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

export function safeSqlIdentifier(name) {
  const value = String(name ?? "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Unsafe table name: ${name}`);
  }
  return `"${value}"`;
}

export function buildOneOffQueryMessage(queryString, messageId = [1, 2, 3, 1]) {
  return {
    OneOffQuery: {
      message_id: messageId,
      query_string: queryString,
    },
  };
}

export function getTableName(table) {
  if (typeof table?.name === "string") return table.name;
  if (typeof table?.name?.name === "string") return table.name.name;
  if (typeof table?.name?.some === "string") return table.name.some;
  if (typeof table?.table_name === "string") return table.table_name;
  return "";
}

export function schemaTableNames(schema) {
  return (schema?.tables ?? []).map(getTableName).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

export function pickTables(tableNames, { include = [], exclude = [] } = {}) {
  const includeNeedles = include.map((value) => String(value).toLowerCase()).filter(Boolean);
  const excludeNeedles = ["spacetime_", ...exclude].map((value) => String(value).toLowerCase()).filter(Boolean);
  return [...new Set(tableNames)]
    .filter((name) => {
      const lower = name.toLowerCase();
      if (excludeNeedles.some((needle) => lower.includes(needle))) return false;
      if (includeNeedles.length === 0) return true;
      return includeNeedles.some((needle) => lower.includes(needle));
    })
    .sort((a, b) => a.localeCompare(b));
}

export function decodeOneOffRows(message) {
  const response = message?.OneOffQueryResponse ?? message?.oneOffQueryResponse ?? message;
  const error = response?.error;
  if (typeof error === "string" && error) throw new Error(error);
  if (error?.some) throw new Error(typeof error.some === "string" ? error.some : JSON.stringify(error.some));
  const output = {};
  for (const table of response?.tables ?? []) {
    const tableName = getTableName(table);
    if (!tableName) continue;
    output[tableName] = (table.rows ?? []).map((row) => {
      if (typeof row !== "string") return row;
      try {
        return JSON.parse(row);
      } catch {
        return row;
      }
    });
  }
  return output;
}

export function extractTokenFromAuthenticateResponse(body) {
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return "";
    try {
      return extractTokenFromAuthenticateResponse(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  return String(body?.token ?? body?.authToken ?? body?.jwt ?? body?.access_token ?? body?.identityToken ?? "").trim();
}

export function extractTokenFromWebsocketTokenResponse(body) {
  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed) return "";
    try {
      return extractTokenFromWebsocketTokenResponse(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }
  return String(body?.token ?? body?.websocketToken ?? body?.identityToken ?? body?.access_token ?? "").trim();
}

export function splitCsv(value) {
  return String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}
