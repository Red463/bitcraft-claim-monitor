import { request } from "node:http";
import { Readable } from "node:stream";

export function createTimbersteelFetch(nativeFetch = globalThis.fetch) {
  const origins = new Set();

  function registerOrigin(origin) {
    origins.add(new URL(origin).origin);
  }

  async function fetch(input, init = {}) {
    const url = new URL(input);
    if (!origins.has(url.origin)) return nativeFetch(input, init);
    return new Promise((resolve, reject) => {
      const headers = Object.fromEntries(new Headers(init.headers));
      headers.host = "app.timbersteeltrade.com";
      if (headers.origin === url.origin) headers.origin = "https://app.timbersteeltrade.com";
      if (init.body != null && headers["content-length"] == null) {
        headers["content-length"] = String(Buffer.byteLength(init.body));
      }
      const clientRequest = request(url, { method: init.method ?? "GET", headers }, (response) => {
        const hasBody = ![204, 205, 304].includes(response.statusCode);
        if (!hasBody) response.resume();
        resolve(new Response(hasBody ? Readable.toWeb(response) : null, {
          status: response.statusCode,
          headers: response.headers,
        }));
      });
      clientRequest.on("error", reject);
      if (init.body != null) clientRequest.write(init.body);
      clientRequest.end();
    });
  }

  return { fetch, registerOrigin };
}
