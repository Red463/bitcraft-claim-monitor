const sensitiveNotificationMetadataKeyPattern = /(?:secret|token|password|setup[_-]?key|authorization|cookie|session|private[_-]?key|license[_-]?key|api[_-]?key)/i;

export function redactNotificationMetadata(value) {
  if (Array.isArray(value)) return value.map((entry) => redactNotificationMetadata(entry));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitiveNotificationMetadataKeyPattern.test(key))
    .map(([key, entry]) => [key, redactNotificationMetadata(entry)]));
}

export function publicNotificationActivityEvent(row, parseJson = JSON.parse) {
  let metadata = {};
  try {
    metadata = parseJson(String(row?.metadata_json ?? "{}"));
  } catch {
    metadata = {};
  }
  return {
    ...row,
    metadata_json: JSON.stringify(redactNotificationMetadata(metadata)),
  };
}
