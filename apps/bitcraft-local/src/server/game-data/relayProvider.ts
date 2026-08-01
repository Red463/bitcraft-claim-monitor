import type {
  DomainKey,
  DomainSnapshotBatch,
  GameDataProvider,
  ProviderConfig,
  ProviderHealth,
  ProviderSink,
  RefreshRequest,
  RefreshResult,
} from "./contracts.ts";
import { RelayHttpClient } from "./http.ts";
import {
  normalizeClaimPayload,
  normalizeClaimCraftPayloads,
  normalizeClaimInventory,
  normalizeClaimRegion,
  normalizeCitizensPayload,
  normalizeDeposits,
  normalizeMembersPayload,
} from "./normalizers.ts";
import { discoverRelayTopologyWithClient, type RelayTopology } from "./topology.ts";

type ProviderDependencies = {
  fetcher?: typeof fetch;
  now?: () => Date;
  scheduleTopologyRefresh?: (callback: () => void, intervalMs: number) => () => void;
};

const HTTP_DOMAINS = new Set<DomainKey>([
  "claim",
  "members",
  "citizens",
  "inventories",
  "crafts",
  "deposits",
]);

class ClaimScopeError extends Error {}

export class RelayBitCraftProvider implements GameDataProvider {
  readonly #fetcher: typeof fetch;
  readonly #now: () => Date;
  readonly #scheduleTopologyRefresh: (callback: () => void, intervalMs: number) => () => void;
  #config: ProviderConfig | null = null;
  #sink: ProviderSink | null = null;
  #http: RelayHttpClient | null = null;
  #topology: RelayTopology | null = null;
  #cancelTopologyRefresh: (() => void) | null = null;
  #running = false;
  #generation = 0;
  #lastRefreshAt: string | null = null;
  #lastError: string | null = null;
  #refreshInFlight: {
    domains: Set<DomainKey>;
    promise: Promise<RefreshResult>;
  } | null = null;
  #reconcileInFlight: Promise<boolean> | null = null;

  constructor(dependencies: ProviderDependencies = {}) {
    this.#fetcher = dependencies.fetcher ?? fetch;
    this.#now = dependencies.now ?? (() => new Date());
    this.#scheduleTopologyRefresh = dependencies.scheduleTopologyRefresh ?? ((callback, intervalMs) => {
      const timer = setInterval(callback, intervalMs);
      timer.unref?.();
      return () => clearInterval(timer);
    });
  }

  async start(config: ProviderConfig, sink: ProviderSink): Promise<void> {
    if (this.#running) throw new Error("Relay provider is already running.");
    this.#config = {
      ...config,
      relayBaseUrl: config.relayBaseUrl.replace(/\/+$/, ""),
      claimId: String(config.claimId).trim(),
      activeRegionIds: [...new Set(config.activeRegionIds.map(String))],
    };
    this.#sink = sink;
    this.#generation = Math.max(0, (sink.nextGeneration?.(this.#config.claimId) ?? 1) - 1);
    this.#http = new RelayHttpClient({
      baseUrl: this.#config.relayBaseUrl,
      fetcher: this.#fetcher,
    });
    this.#running = true;
    try {
      await this.#refreshTopology();
      await this.refresh({
        claimId: this.#config.claimId,
        domains: ["claim", "members", "citizens"],
        reason: "startup",
      });
      this.#cancelTopologyRefresh = this.#scheduleTopologyRefresh(() => {
        void this.#refreshTopology().catch((error) => {
          this.#lastError = error instanceof Error ? error.message : String(error);
          void this.#persistHealth();
        });
      }, this.#config.topologyRefreshMs ?? 60_000);
    } catch (error) {
      this.#running = false;
      this.#lastError = error instanceof Error ? error.message : String(error);
      await this.#persistHealth();
      throw error;
    }
  }

  reconcile(config: ProviderConfig, sink: ProviderSink): Promise<boolean> {
    const normalized = {
      ...config,
      relayBaseUrl: config.relayBaseUrl.replace(/\/+$/, ""),
      claimId: String(config.claimId).trim(),
      activeRegionIds: [...new Set(config.activeRegionIds.map(String))].sort(),
    };
    const current = this.#config;
    const sameConfig = this.#running
      && current?.relayBaseUrl === normalized.relayBaseUrl
      && current.claimId === normalized.claimId
      && (current.topologyRefreshMs ?? 60_000) === (normalized.topologyRefreshMs ?? 60_000)
      && [...current.activeRegionIds].sort().join(",") === normalized.activeRegionIds.join(",");
    if (sameConfig) return Promise.resolve(false);
    if (this.#reconcileInFlight) return this.#reconcileInFlight;
    const reconcile = (async () => {
      if (this.#running || this.#config) await this.stop();
      await this.start(normalized, sink);
      return true;
    })();
    this.#reconcileInFlight = reconcile;
    return reconcile.finally(() => {
      if (this.#reconcileInFlight === reconcile) this.#reconcileInFlight = null;
    });
  }

  refresh(request: RefreshRequest): Promise<RefreshResult> {
    const config = this.#requireConfig();
    if (request.claimId !== config.claimId) {
      return Promise.reject(new Error("Refresh claim does not match the configured monitored claim."));
    }
    const domains = [...new Set(request.domains)].filter((domain) => HTTP_DOMAINS.has(domain));
    const active = this.#refreshInFlight;
    if (active) {
      if (domains.every((domain) => active.domains.has(domain))) return active.promise;
      return active.promise.catch(() => undefined).then(() => this.refresh(request));
    }
    const promise = this.#performRefresh({ ...request, domains });
    this.#refreshInFlight = {
      domains: new Set(domains),
      promise,
    };
    return promise.finally(() => {
      if (this.#refreshInFlight?.promise === promise) this.#refreshInFlight = null;
    });
  }

  async #performRefresh(request: RefreshRequest): Promise<RefreshResult> {
    const config = this.#requireConfig();
    const sink = this.#requireSink();
    const http = this.#requireHttp();
    const domains = request.domains;
    const receivedAt = this.#now().toISOString();
    const batch: DomainSnapshotBatch = {
      claimId: config.claimId,
      generation: this.#generation + 1,
      domains: {},
    };
    const failed: Partial<Record<DomainKey, string>> = {};

    let claimWire: unknown;
    let regionId: string;
    try {
      claimWire = await http.claim(config.claimId);
      const returnedClaimId = normalizeClaimPayload(claimWire).data.entityId;
      if (returnedClaimId !== config.claimId) {
        throw new ClaimScopeError(
          `Relay claim ${returnedClaimId} does not match the configured claim ${config.claimId}.`,
        );
      }
      regionId = normalizeClaimRegion(claimWire);
      const regionTopology = this.#topology?.regions.get(regionId);
      if (!regionTopology?.ready) {
        throw new Error(`Claim region ${regionId} is not available from the current Relay topology.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const domain of domains) {
        failed[domain] = message;
        await sink.markError?.(config.claimId, domain, message, receivedAt);
      }
      this.#lastError = message;
      await this.#persistHealth();
      throw error;
    }

    if (domains.includes("claim")) {
      try {
        const normalized = normalizeClaimPayload(claimWire);
        batch.domains.claim = {
          data: normalized.data,
          confidence: normalized.warnings.length ? "partial" : "joined",
          provenance: {
            provider: "relay",
            sourceKey: "relay-cache",
            regionId,
            database: null,
            schemaFingerprint: null,
            sourceObservedAt: null,
            receivedAt,
          },
          warnings: normalized.warnings,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.claim = message;
        await sink.markError?.(config.claimId, "claim", message, receivedAt);
      }
    }
    if (domains.includes("members") || domains.includes("citizens")) {
      try {
        const membersWire = await http.members(config.claimId);
        const normalizedMembers = normalizeMembersPayload(membersWire);
        const foreignMember = normalizedMembers.data.find(
          ({ claimEntityId }) => claimEntityId !== config.claimId,
        );
        if (foreignMember) {
          throw new ClaimScopeError(
            `Relay member claim ${foreignMember.claimEntityId} does not match the configured claim ${config.claimId}.`,
          );
        }
        const provenance = {
          provider: "relay" as const,
          sourceKey: "relay-cache" as const,
          regionId,
          database: null,
          schemaFingerprint: null,
          sourceObservedAt: null,
          receivedAt,
        };
        if (domains.includes("members")) {
          batch.domains.members = {
            data: normalizedMembers.data,
            confidence: normalizedMembers.warnings.length ? "partial" : "joined",
            provenance,
            warnings: normalizedMembers.warnings,
          };
        }
        if (domains.includes("citizens")) {
          const normalized = normalizeCitizensPayload(membersWire);
          batch.domains.citizens = {
            data: normalized.data,
            confidence: normalized.warnings.length ? "partial" : "joined",
            provenance,
            warnings: normalized.warnings,
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof ClaimScopeError) {
          for (const domain of domains) {
            await sink.markError?.(config.claimId, domain, message, receivedAt);
          }
          this.#lastError = message;
          await this.#persistHealth();
          throw error;
        }
        for (const domain of ["members", "citizens"] as const) {
          if (!domains.includes(domain)) continue;
          failed[domain] = `${domain === "members" ? "Members" : "Citizens"}: ${message}`;
          await sink.markError?.(config.claimId, domain, failed[domain], receivedAt);
        }
      }
    }
    if (domains.includes("inventories")) {
      try {
        batch.domains.inventories = {
          data: normalizeClaimInventory(await http.inventory(config.claimId)),
          confidence: "joined",
          provenance: {
            provider: "relay",
            sourceKey: "relay-cache",
            regionId,
            database: null,
            schemaFingerprint: null,
            sourceObservedAt: null,
            receivedAt,
          },
          warnings: [],
        };
      } catch (error) {
        const message = `Inventories: ${error instanceof Error ? error.message : String(error)}`;
        failed.inventories = message;
        await sink.markError?.(config.claimId, "inventories", message, receivedAt);
      }
    }
    if (domains.includes("crafts")) {
      try {
        const craftPayloads = await Promise.all([
          http.crafts(config.claimId, false),
          http.crafts(config.claimId, true),
        ]);
        batch.domains.crafts = {
          data: normalizeClaimCraftPayloads(craftPayloads),
          confidence: "joined",
          provenance: {
            provider: "relay",
            sourceKey: "relay-cache",
            regionId,
            database: null,
            schemaFingerprint: null,
            sourceObservedAt: null,
            receivedAt,
          },
          warnings: ["Craft contributor history is not available from the proven Relay mapping."],
        };
      } catch (error) {
        const message = `Crafts: ${error instanceof Error ? error.message : String(error)}`;
        failed.crafts = message;
        await sink.markError?.(config.claimId, "crafts", message, receivedAt);
      }
    }
    if (domains.includes("deposits")) {
      try {
        const deposits = normalizeDeposits(await http.deposits(regionId));
        const foreignDeposit = deposits.find((deposit) => deposit.regionId !== regionId);
        if (foreignDeposit) {
          throw new ClaimScopeError(
            `Relay deposit region ${foreignDeposit.regionId} does not match the claim region ${regionId}.`,
          );
        }
        batch.domains.deposits = {
          data: deposits,
          confidence: "joined",
          provenance: {
            provider: "relay",
            sourceKey: "relay-cache",
            regionId,
            database: null,
            schemaFingerprint: null,
            sourceObservedAt: null,
            receivedAt,
          },
          warnings: [],
        };
      } catch (error) {
        const message = `Deposits: ${error instanceof Error ? error.message : String(error)}`;
        failed.deposits = message;
        await sink.markError?.(config.claimId, "deposits", message, receivedAt);
      }
    }

    if (Object.keys(batch.domains).length) {
      await sink.commitGeneration(batch);
      this.#generation = batch.generation;
    }
    this.#lastRefreshAt = receivedAt;
    this.#lastError = Object.values(failed).filter(Boolean).join("; ") || null;
    await this.#persistHealth();
    if (!Object.keys(batch.domains).length && this.#lastError) {
      throw new Error(this.#lastError);
    }
    return {
      generation: this.#generation,
      refreshed: Object.keys(batch.domains) as DomainKey[],
      failed,
    };
  }

  health(): ProviderHealth {
    const sources: ProviderHealth["sources"] = {};
    if (this.#topology?.global) {
      sources.global = {
        ready: this.#topology.global.ready,
        database: this.#topology.global.database,
        schemaFingerprint: this.#topology.global.schemaFingerprint,
      };
    }
    for (const source of this.#topology?.regions.values() ?? []) {
      sources[source.sourceKey] = {
        ready: source.ready,
        database: source.database,
        schemaFingerprint: source.schemaFingerprint,
      };
    }
    return {
      provider: "relay",
      running: this.#running,
      topologyReady: this.#topology != null,
      cacheReady: this.#topology?.cacheReady === true,
      generation: this.#generation,
      lastRefreshAt: this.#lastRefreshAt,
      lastError: this.#lastError,
      sources,
    };
  }

  async stop(): Promise<void> {
    this.#cancelTopologyRefresh?.();
    this.#cancelTopologyRefresh = null;
    await this.#refreshInFlight?.promise.catch(() => {});
    this.#refreshInFlight = null;
    this.#running = false;
    await this.#persistHealth();
  }

  async #refreshTopology() {
    const config = this.#requireConfig();
    this.#topology = await discoverRelayTopologyWithClient(
      config.relayBaseUrl,
      this.#requireHttp(),
      this.#fetcher,
    );
    if (!this.#topology.cacheReady) throw new Error("Relay HTTP cache is not ready.");
    if (!this.#topology.global?.ready) throw new Error("Relay global source is not ready.");
    await this.#persistHealth();
  }

  async #persistHealth() {
    await this.#sink?.recordHealth?.(this.health(), this.#now().toISOString());
  }

  #requireConfig() {
    if (!this.#config) throw new Error("Relay provider has not been configured.");
    return this.#config;
  }

  #requireSink() {
    if (!this.#sink) throw new Error("Relay provider sink is unavailable.");
    return this.#sink;
  }

  #requireHttp() {
    if (!this.#http) throw new Error("Relay HTTP client is unavailable.");
    return this.#http;
  }
}
