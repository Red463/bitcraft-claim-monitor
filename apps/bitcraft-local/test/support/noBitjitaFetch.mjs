export function createNoBitjitaFetch(fetcher = fetch) {
  return async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, "http://127.0.0.1");
    if (url.hostname === "bitjita.com" || url.hostname.endsWith(".bitjita.com")) {
      throw new Error(`Forbidden BitJita test request: ${url.origin}${url.pathname}`);
    }
    return fetcher(input, init);
  };
}
