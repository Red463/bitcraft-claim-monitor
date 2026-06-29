import { sessionTokenFromRequest, sessionTokenHash } from "./serverSessions.mjs";

export function lookupHttpSessionUser({
  req,
  cookieName,
  deleteExpiredSessions,
  userBySession,
  now = () => new Date(),
} = {}) {
  const token = sessionTokenFromRequest(req, cookieName);
  if (!token) return null;
  const timestamp = now().toISOString();
  deleteExpiredSessions.run(timestamp);
  return userBySession.get(sessionTokenHash(token), timestamp) ?? null;
}
