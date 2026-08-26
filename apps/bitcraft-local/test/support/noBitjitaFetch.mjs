export function createNoBitjitaFetch(fetcher = fetch) {
  return async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, "http://127.0.0.1");
    if (url.hostname === "bitjita.com" || url.hostname.endsWith(".bitjita.com")) {
      throw new Error(`Forbidden BitJita test request: ${url.origin}${url.pathname}`);
    }
    if (url.pathname.startsWith("/api/local/game-icon/") && !/^\/api\/local\/game-icon\/(?:item|cargo)\/\d+$/.test(url.pathname)) {
      throw new Error(`Forbidden non-standard game icon fallback: ${url.pathname}`);
    }
    return fetcher(input, init);
  };
}
