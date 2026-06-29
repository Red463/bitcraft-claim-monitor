import { csrfToken, validCsrfHeader } from "./httpCsrf.mjs";
import { sameOriginRequest } from "./httpRequests.mjs";

export function adminMutationRejection(req, options = {}) {
  if (!["POST", "PUT", "DELETE"].includes(req.method ?? "")) return null;
  if (!sameOriginRequest(req, { isProduction: Boolean(options.isProduction) })) {
    return "Cross-origin administrator mutation rejected";
  }
  const expected = csrfToken(req);
  const actual = String(req.headers["x-csrf-token"] ?? "");
  if (!validCsrfHeader(expected, actual)) return "Invalid administrator request token";
  return null;
}
