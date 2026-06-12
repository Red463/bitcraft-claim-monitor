import React from "react";

import { toNumber, unwrap, type AnyRecord } from "../main-app-data";
import type { ActivePanel, LoadState } from "../types/app";
import { mapWithBrowserConcurrency } from "../utils/concurrency";
import { normalizePlayer } from "../utils/normalize";

const API = "/api/bitjita";
const LOCAL_API = "/api/local";

function appendPartialError(raw: AnyRecord, message: string) {
  const current = Array.isArray(raw.partialErrors) ? raw.partialErrors : [];
  raw.partialErrors = [...current, message];
}

function dataAreaLabel(path: string) {
  if (path.includes("/market/")) return "market data";
  if (path.includes("/crafts")) return "production data";
  if (path.includes("/members")) return "member data";
  if (path.includes("/citizens")) return "member profession data";
  if (path.includes("/inventories")) return "inventory data";
  if (path.includes("/construction")) return "construction data";
  if (path.includes("/research")) return "research data";
  if (path.includes("/regions")) return "region data";
  if (path.includes("/skills")) return "profession reference data";
  if (path.includes("/claims/")) return "settlement data";
  return "BitJita data";
}

function httpErrorMessage(path: string, status: number) {
  const label = dataAreaLabel(path);
  const statusText = status >= 500
    ? "BitJita may be having a temporary issue."
    : status === 429
      ? "The local app or BitJita is rate limiting requests. Refresh will retry automatically."
    : "The request could not be completed.";
  return `Unable to refresh ${label} (HTTP ${status}). ${statusText}`;
}

function endpointMap(claimId: string, activePanel?: ActivePanel): Record<string, string> {
  const endpoints = {
    claim: `/claims/${claimId}`,
    members: `/claims/${claimId}/members`,
    citizens: `/claims/${claimId}/citizens`,
    buildings: `/claims/${claimId}/buildings`,
    inventories: `/claims/${claimId}/inventories`,
    construction: `/claims/${claimId}/construction`,
    research: `/claims/${claimId}/research`,
    recruitment: `/claims/${claimId}/recruitment`,
    market: `/claims/${claimId}/market/listings?limit=200`,
    crafts: `/crafts?claimEntityId=${claimId}&completed=false`,
    layout: `/claims/${claimId}/layout`,
    skills: `/skills`,
  } as const;
  if (!activePanel) return endpoints;
  if (activePanel === "activity" || activePanel === "admin") return {};

  const keys = new Set<keyof typeof endpoints>(["claim", "members", "crafts"]);
  const add = (...nextKeys: Array<keyof typeof endpoints>) => nextKeys.forEach((key) => keys.add(key));

  switch (activePanel) {
    case "dashboard":
      add("citizens", "buildings", "construction", "research", "market");
      break;
    case "members":
      add("citizens");
      break;
    case "skills":
      add("citizens", "skills");
      break;
    case "production":
      add("citizens");
      break;
    case "inventory":
      add("inventories");
      break;
    case "construction":
      add("construction", "inventories");
      break;
    case "research":
      add("research");
      break;
    case "market":
      add("market");
      break;
    default:
      break;
  }

  return Object.fromEntries([...keys].map((key) => [key, endpoints[key]]));
}

export function useBitjitaData(refreshToken: number, claimId: string, activePanel: ActivePanel): LoadState<AnyRecord> {
  const [state, setState] = React.useState<LoadState<AnyRecord>>({
    data: null,
    error: null,
    loading: true,
  });

  React.useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        async function request(path: string) {
          const response = await fetch(`${API}${path}`, { signal: controller.signal });
          if (!response.ok) throw new Error(httpErrorMessage(path, response.status));
          return response.json();
        }
        async function requestAllMarketListings() {
          const first = await request(`/claims/${claimId}/market/listings?page=1&limit=200`);
          const totalPages = Math.max(toNumber(first.totalPages) || 1, 1);
          const remaining = totalPages > 1
            ? await mapWithBrowserConcurrency(Array.from({ length: totalPages - 1 }, (_, index) => index + 2), 4, (page) => request(`/claims/${claimId}/market/listings?page=${page}&limit=200`))
            : [];
          return { ...first, listings: [first, ...remaining].flatMap((page) => page.listings ?? []) };
        }
        const requestedEndpoints = endpointMap(claimId, activePanel);
        if (Object.keys(requestedEndpoints).length === 0) {
          React.startTransition(() => setState((prev) => ({ ...prev, loading: false, error: null })));
          return;
        }
        if (activePanel === "dashboard") {
          const response = await fetch(`${LOCAL_API}/dashboard-data?claimId=${encodeURIComponent(claimId)}`, { signal: controller.signal });
          if (!response.ok) throw new Error(`Unable to refresh dashboard data (HTTP ${response.status}). ${response.status >= 500 ? "BitJita or the local collector may be having a temporary issue." : "The request could not be completed."}`);
          const raw = await response.json();
          React.startTransition(() => setState({ loading: false, error: null, data: raw }));
          return;
        }
        const entries = await Promise.all(
          Object.entries(requestedEndpoints).map(async ([key, path]) => {
            return [key, key === "market" ? await requestAllMarketListings() : await request(path)] as const;
          }),
        );
        const raw = Object.fromEntries(entries) as AnyRecord;
        const claim = raw.claim?.claim ?? raw.claim;
        const members = unwrap<AnyRecord[]>(raw.members, "members", []);
        if (activePanel === "production") {
          try {
            const response = await fetch(`${LOCAL_API}/production/crafts`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({ claimId, members }),
            });
            if (response.ok) {
              raw.crafts = await response.json();
            } else {
              appendPartialError(raw, `Unable to refresh full production details (HTTP ${response.status}). Showing direct BitJita craft data only.`);
            }
          } catch (error) {
            if (!controller.signal.aborted) {
              appendPartialError(raw, `Production craft aggregation failed: ${error instanceof Error ? error.message : String(error)}. Showing direct BitJita craft data only.`);
            }
          }
        }
        const crafts = unwrap<AnyRecord[]>(raw.crafts, "craftResults", []);
        const readsPlayerDetail = activePanel === "members" || activePanel === "map";
        const readsProductionDetail = activePanel === "production";
        const readsRegionDetail = activePanel === "empire";
        const [playerResults, contributionResults, regionPayload, tradeVolumePayload] = await Promise.all([
          readsPlayerDetail ? fetch(`${LOCAL_API}/player-details`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ members }),
          })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error(`player details HTTP ${response.status}`)))
            .then((payload) => unwrap<AnyRecord[]>(payload, "players", []).map((player) => ({ status: "fulfilled", value: player }) as PromiseFulfilledResult<AnyRecord>))
            .catch((): Array<PromiseFulfilledResult<AnyRecord>> => []) : Promise.resolve([] as Array<PromiseFulfilledResult<AnyRecord>>),
          readsProductionDetail ? mapWithBrowserConcurrency(crafts.filter((craft) => craft.entityId), 4, async (craft) => {
            try {
              return {
                status: "fulfilled",
                value: {
                  craftId: String(craft.entityId),
                  payload: await request(`/crafts/${craft.entityId}/contributions`),
                },
              } as PromiseFulfilledResult<{ craftId: string; payload: AnyRecord }>;
            } catch (reason) {
              return { status: "rejected", reason } as PromiseRejectedResult;
            }
          }) : Promise.resolve([]),
          readsRegionDetail ? request("/regions/status").catch(() => ({ regions: [] })) : Promise.resolve({ regions: [] }),
          readsRegionDetail ? request(`/stats/trade-volume?bucket=1%20day&limit=30&regionId=${encodeURIComponent(String(claim?.regionId ?? ""))}`).catch(() => ({ buckets: [], items: [], regions: [] })) : Promise.resolve({ buckets: [], items: [], regions: [] }),
        ]);
        raw.region = readsRegionDetail && claim?.regionId
          ? await fetch(`${LOCAL_API}/region/claims?regionId=${encodeURIComponent(String(claim.regionId))}`, { signal: controller.signal })
            .then((response) => response.ok ? response.json() : Promise.reject(new Error(`region claims HTTP ${response.status}`)))
            .catch(() => ({ claims: [] }))
          : { claims: [] };
        raw.players = playerResults
          .filter((result): result is PromiseFulfilledResult<AnyRecord> => result.status === "fulfilled")
          .map((result) => normalizePlayer(result.value));
        raw.marketApi = { histories: [], trades: [] };
        const failedContributionCount = contributionResults.filter((result) => result.status === "rejected").length;
        if (failedContributionCount) {
          appendPartialError(raw, `${failedContributionCount} production contribution request${failedContributionCount === 1 ? "" : "s"} failed. Some contributor totals may be incomplete.`);
        }
        raw.contributions = Object.fromEntries(contributionResults
          .filter((result): result is PromiseFulfilledResult<{ craftId: string; payload: AnyRecord }> => result.status === "fulfilled")
          .map((result) => [result.value.craftId, result.value.payload.contributions ?? []]));
        raw.regionStatus = regionPayload;
        raw.tradeVolume = tradeVolumePayload;
        React.startTransition(() => setState({ loading: false, error: null, data: raw }));
      } catch (err) {
        if (!controller.signal.aborted) {
          setState((prev) => ({ loading: false, error: err instanceof Error ? err.message : String(err), data: prev.data }));
        }
      }
    }
    load();
    return () => controller.abort();
  }, [activePanel, claimId, refreshToken]);

  return state;
}
