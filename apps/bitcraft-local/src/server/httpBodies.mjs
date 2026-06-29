export const BODY_LIMITS = {
  auth: 8 * 1024,
  analytics: 8 * 1024,
  json: 64 * 1024,
  settings: 256 * 1024,
  branding: 2 * 1024 * 1024,
  snapshot: 1024 * 1024,
  discordInteraction: 256 * 1024,
};

export class RequestBodyTooLargeError extends Error {
  constructor(limit) {
    super(`Request body is too large; maximum size is ${limit} bytes`);
    this.statusCode = 413;
  }
}

export async function readRawBody(req, limit = BODY_LIMITS.json) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw new RequestBodyTooLargeError(limit);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, limit = BODY_LIMITS.json) {
  return JSON.parse((await readRawBody(req, limit)).toString("utf8") || "{}");
}