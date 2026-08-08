type Fetcher = typeof fetch;

export type RelayHttpClientOptions = {
  baseUrl: string;
  fetcher?: Fetcher;
  timeoutMs?: number;
  retryDelayMs?: number;
  now?: () => number;
};

export class RelayHttpClient {
  readonly #baseUrl: string;
  readonly #fetcher: Fetcher;
  readonly #timeoutMs: number;
  readonly #retryDelayMs: number;
  readonly #now: () => number;
  readonly #failures: number[] = [];
  #circuitOpenUntil = 0;

  constructor(options: RelayHttpClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#fetcher = options.fetcher ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? 8_000;
    this.#retryDelayMs = options.retryDelayMs ?? 250;
    this.#now = options.now ?? Date.now;
  }

  health() {
    return this.#request("/health");
  }

  cacheHealth() {
    return this.#request("/cache-health");
  }

  claim(claimId: string) {
    return this.#request(`/claim/${encodeURIComponent(claimId)}`);
  }

  members(claimId: string) {
    return this.#request(`/claim/${encodeURIComponent(claimId)}/members`);
  }

  inventory(claimId: string) {
    return this.#request(`/claim/${encodeURIComponent(claimId)}/inventory`);
  }

  player(playerId: string) {
    return this.#request(`/player/${encodeURIComponent(playerId)}`);
  }

  playerInventory(playerId: string) {
    return this.#request(`/player/${encodeURIComponent(playerId)}/inventory`);
  }

  playerHousing(playerId: string) {
    return this.#request(`/player/${encodeURIComponent(playerId)}/housing`);
  }

  crafts(claimId: string, completed = false) {
    return this.#request(`/claim/${encodeURIComponent(claimId)}/crafts?completed=${completed ? "true" : "false"}`);
  }

  deposits(regionId: string) {
    return this.#request(`/deposits?region=${encodeURIComponent(regionId)}`);
  }

  storageLogs(options: {
    storageId: string;
    regionId: string;
    limit: number;
  }) {
    const parameters = new URLSearchParams({
      storageId: String(options.storageId),
      region: String(options.regionId),
      limit: String(options.limit),
    });
    return this.#request(`/storage-logs?${parameters}`);
  }

  async #request(pathname: string): Promise<unknown> {
    const now = this.#now();
    if (now < this.#circuitOpenUntil) {
      throw new Error(`Relay HTTP circuit is open for another ${this.#circuitOpenUntil - now}ms.`);
    }
    try {
      const result = await this.#attempt(pathname);
      this.#failures.length = 0;
      return result;
    } catch (firstError) {
      if (!this.#retryable(firstError)) {
        this.#recordFailure();
        throw firstError;
      }
      if (this.#retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.#retryDelayMs));
      }
      try {
        const result = await this.#attempt(pathname);
        this.#failures.length = 0;
        return result;
      } catch (secondError) {
        this.#recordFailure();
        throw secondError;
      }
    }
  }

  async #attempt(pathname: string): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`Relay HTTP timed out after ${this.#timeoutMs}ms.`)), this.#timeoutMs);
    try {
      const response = await this.#fetcher(`${this.#baseUrl}${pathname}`, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`Relay HTTP ${response.status} for ${pathname}`) as Error & { status?: number };
        error.status = response.status;
        throw error;
      }
      return response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  #retryable(error: unknown) {
    const status = (error as { status?: unknown })?.status;
    return status == null || status === 429 || (typeof status === "number" && status >= 500);
  }

  #recordFailure() {
    const now = this.#now();
    this.#failures.push(now);
    while (this.#failures.length && this.#failures[0] < now - 60_000) this.#failures.shift();
    if (this.#failures.length >= 5) this.#circuitOpenUntil = now + 30_000;
  }
}
