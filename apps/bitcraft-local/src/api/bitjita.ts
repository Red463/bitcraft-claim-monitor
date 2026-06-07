import React from "react";

import { toNumber, unwrap, type AnyRecord } from "../main-app-data";
import type { ActivePanel, LoadState } from "../types/app";
import { mapWithBrowserConcurrency } from "../utils/concurrency";
import { normalizePlayer } from "../utils/normalize";

const API = "/api/bitjita";
const LOCAL_API = "/api/local";

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
  if (activePanel === "activity") return {};

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
          if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
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
        const entries = await Promise.all(
          Object.entries(requestedEndpoints).map(async ([key, path]) => {
            return [key, key === "market" ? await requestAllMarketListings() : await request(path)] as const;
          }),
        );
        const raw = Object.fromEntries(entries);
        const claim = raw.claim?.claim ?? raw.claim;
        const members = unwrap<AnyRecord[]>(raw.members, "members", []);
        const memberIds = members.map((member) => String(member.playerEntityId ?? "")).filter(Boolean);
        if (activePanel === "production") {
          raw.crafts = await fetch(`${LOCAL_API}/production/crafts`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ claimId, members }),
          }).then((response) => response.ok ? response.json() : raw.crafts).catch(() => raw.crafts);
        }
        const crafts = unwrap<AnyRecord[]>(raw.crafts, "craftResults", []);
        const readsPlayerDetail = activePanel === "dashboard" || activePanel === "members" || activePanel === "map";
        const readsProductionDetail = activePanel === "production" || activePanel === "dashboard";
        const readsRegionDetail = activePanel === "dashboard" || activePanel === "empire";
        const [playerResults, contributionResults, regionPayload, tradeVolumePayload] = await Promise.all([
          readsPlayerDetail ? mapWithBrowserConcurrency(memberIds, 4, async (id) => {
            try {
              const payload = await request(`/players/${id}`);
              return { status: "fulfilled", value: payload.player ?? payload } as PromiseFulfilledResult<AnyRecord>;
            } catch (reason) {
              return { status: "rejected", reason } as PromiseRejectedResult;
            }
          }) : Promise.resolve([]),
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
