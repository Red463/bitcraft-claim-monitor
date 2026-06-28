import { securityHeaders } from "./httpRoutes.mjs";

export function sendJson(res, status, body, headers = {}) {
  const json = JSON.stringify(body);
  res.writeHead(status, securityHeaders({
    "content-type": "application/json",
    ...headers,
  }));
  res.end(json);
}

export function sendText(res, status, text, contentType, headers = {}) {
  res.writeHead(status, securityHeaders({ "content-type": contentType, "cache-control": "no-store", ...headers }));
  res.end(text);
}

export function sendBinary(res, status, content, contentType, headers = {}) {
  res.writeHead(status, securityHeaders({ "content-type": contentType, "cache-control": "no-cache", ...headers }));
  res.end(content);
}