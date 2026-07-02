import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { setDefaultResultOrder } from "node:dns";
import { inflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMemberPermissions } from "./shared/member-permissions.mjs";
import { mimeType, routeGroup, securityHeaders, shouldLogVisitor, staticCacheControl } from "./src/server/httpRoutes.mjs";
import { sendBinary, sendJson as send, sendText } from "./src/server/httpResponses.mjs";
import { parseCookies, serializeHttpOnlyCookie } from "./src/server/httpCookies.mjs";
import { originFromRequest as requestOriginFromRequest, sameOriginRequest as requestSameOriginRequest } from "./src/server/httpRequests.mjs";
import { csrfToken } from "./src/server/httpCsrf.mjs";
import { BODY_LIMITS, readJson, readRawBody } from "./src/server/httpBodies.mjs";
import { createRateLimiter, RATE_LIMITS, requestAddress } from "./src/server/httpRateLimit.mjs";
import { anonymizeIpAddress, createIpHasher, normalizeIpAddress } from "./src/server/visitorIp.mjs";
import { normalizeVisitorSecuritySettings } from "./src/server/visitorSecuritySettings.mjs";
import { publicNotificationActivityEvent } from "./src/server/notificationActivity.mjs";
import { dealAlertDiscordPayload, publicDealAlertRow } from "./src/server/dealAlerts.mjs";
import { nextScheduledRunIso, parseScheduledJobSchedule, publicScheduledJobRow, recoverStaleScheduledJobs as recoverStaleScheduledJobsRegistry, scheduledJobsStatus as scheduledJobsStatusResponse, scheduledJobScheduleLabel, seedScheduledJobs as seedScheduledJobsRegistry, serializeScheduledJobSchedule } from "./src/server/scheduledJobs.mjs";
import { bitjitaTimestampIso, marketEventSourceKey, normalizeListing, tradeMatchesListing } from "./src/server/marketActivity.mjs";
import { craftDisplayName, normalizeProductionJob, normalizeProfessionKey } from "./src/server/productionActivity.mjs";
import { recipeCatalogKey, recipeTargetFromDetail, recipeTargetFromRow } from "./src/server/recipeCatalog.mjs";
import { defaultDiscordSettings, normalizeDiscordPresence, normalizeDiscordRolePanel, normalizeDiscordSettings, normalizeDiscordWelcomeFlow } from "./src/server/discordSettings.mjs";
import { resolveDiscordChannelSelection } from "./src/server/discordNotifications.mjs";
import { marketSaleDiscordRecipientDecision } from "./src/server/marketSaleDiscordRecipients.mjs";
import { parseYouTubeFeed, resolveYouTubeChannelInput, youtubeFeedUrl, youtubeVideosToNotify } from "./src/server/youtubeMonitor.mjs";
import { collectorCurrentTables, collectorPrimaryPayloadDomain, domainPayloadKeys, normalizeCollectorSettings, payloadDomainCollector } from "./src/server/collectorSettings.mjs";
import { normalizeMarketDealWatchSettings } from "./src/server/marketDealWatchSettings.mjs";
import { normalizePopupConfig, publicPopups } from "./src/server/appPopups.mjs";
import { createBitjitaProxyCache } from "./src/server/bitjitaProxyCache.mjs";
import { ADMIN_ROLE_LABELS, adminHasPermission, adminPermissionFor, normalizeAdminRole } from "./src/server/adminPermissions.mjs";
import { discordAvatarUrl, publicAdminUser, publicAppUser } from "./src/server/publicUsers.mjs";
import { adminMutationRejection } from "./src/server/adminRequestGuards.mjs";
import { discordProfileDisplayName, validAdminUsername, validDiscordId } from "./src/server/authIdentity.mjs";
import { createAdminLoginAttemptStore, loginAttemptKey } from "./src/server/adminLoginAttempts.mjs";
import { hashPassword, validLegacyAdminPassword, verifyPassword } from "./src/server/passwordAuth.mjs";
import { DEFAULT_APP_PAGE, normalizeSavedRefreshIntervalSeconds, normalizeSavedSnapshotRetentionDays, normalizeStoredExcludedMemberIds, normalizeSubmittedExcludedMemberIds, parseRegionIds, validAppPage, validBitcraftSyncUrl, validClaimId, validRefreshIntervalSeconds, validRegionId, validSnapshotRetentionDays } from "./src/server/appSettingsPolicy.mjs";
import { applyDefaultAppSettings, defaultTheme } from "./src/server/defaultAppSettings.mjs";
import { applySchemaBootstrap } from "./src/server/schemaBootstrap.mjs";
import { applyDatabaseConnectionPragmas } from "./src/server/databasePragmas.mjs";
import { jobBudgetAllowsMore, normalizeJobBudget, selectResumeBatch } from "./src/server/jobBudget.mjs";
import { createPreparedStatements } from "./src/server/preparedStatements.mjs";
import { defaultOwnerDiscordIdFromEnv, seedDefaultDiscordOwner } from "./src/server/defaultOwnerAdmin.mjs";
import { applyAdditiveColumnMigrations, applyLegacySchemaCleanup, applySchemaIndexStatements } from "./src/server/schemaMigrations.mjs";
import { processRoleCapabilities, resolveProcessRole } from "./src/server/processRole.mjs";
import { currentAppAnnouncementKey as resolveCurrentAppAnnouncementKey, currentAppBuildId as resolveCurrentAppBuildId, currentAppReleaseKey as resolveCurrentAppReleaseKey, releaseVersionAlreadyAnnounced } from "./src/server/appRelease.mjs";
import { lookupHttpSessionUser } from "./src/server/sessionLookups.mjs";
import { snapshotActivityChanges, snapshotSummary } from "./src/server/snapshotPlanning.mjs";
import { resolveDiscordOAuthConfig } from "./src/server/discordOAuthConfig.mjs";
import { buildDiscordAuthorizeUrl, discordOAuthCallbackDecision, discordOAuthProfileAccount, discordOAuthProfileRequest, discordOAuthSuccessRedirect, discordOAuthTokenRequest } from "./src/server/discordOAuthFlow.mjs";
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  APP_USER_SESSION_COOKIE_NAME,
  APP_USER_SESSION_MAX_AGE_SECONDS,
  clearHttpSessionCookie,
  createHttpSession,
  sessionTokenFromRequest,
  sessionTokenHash,
} from "./src/server/serverSessions.mjs";
import {
  clearOAuthStateCookie,
  oauthStateCookie,
  readOAuthStateCookie,
  resolveOAuthStateSecret,
} from "./src/server/oauthState.mjs";

setDefaultResultOrder("ipv4first");

const rateLimit = createRateLimiter({ sendJson: send });

// This server is the local app boundary: it serves the built frontend, proxies
// BitJita requests, owns SQLite history/configuration, validates admin sessions,
// runs scheduled jobs, and delivers Discord notifications. Keep cross-cutting
// concerns here small and explicit; route-specific UI shaping belongs in the
// frontend or focused helper functions below.
const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, "dist");
const isProduction = process.env.NODE_ENV === "production";
const isTestRuntime = process.env.BITCRAFT_TEST === "true" || process.env.NODE_ENV === "test";
const serveFrontend = isProduction || process.env.SERVE_STATIC === "true";
const adminSetupKey = process.env.ADMIN_SETUP_KEY ?? "";
const legacyAdminPasswordAuth = process.env.ENABLE_LEGACY_ADMIN_PASSWORD_AUTH === "true";
const processRole = resolveProcessRole(process.env, { isProduction });
const processRoleConfig = processRoleCapabilities(processRole);
const serverPollingEnabled = processRoleConfig.runBackgroundJobs && process.env.ENABLE_SERVER_POLLING !== "false";
const discordStartupEnabled = processRoleConfig.runBackgroundJobs && process.env.ENABLE_DISCORD_STARTUP !== "false";
const scheduledJobsEnabled = processRoleConfig.runBackgroundJobs && process.env.ENABLE_SCHEDULED_JOBS !== "false";
const discordNotificationOutboxIntervalMs = Math.max(Number(process.env.DISCORD_NOTIFICATION_OUTBOX_INTERVAL_MS ?? 5000), 1000);
const discordNotificationMaxAttempts = Math.max(Number(process.env.DISCORD_NOTIFICATION_MAX_ATTEMPTS ?? 8), 1);
let discordNotificationOutboxRunning = false;
const storageActivityJobBudget = normalizeJobBudget({
  maxRuntimeMs: process.env.STORAGE_ACTIVITY_MAX_RUNTIME_MS ?? 15000,
  batchSize: process.env.STORAGE_ACTIVITY_BATCH_SIZE ?? 25,
});
const marketTradeJobBudget = normalizeJobBudget({
  maxRuntimeMs: process.env.MARKET_TRADES_MAX_RUNTIME_MS ?? 15000,
  batchSize: process.env.MARKET_TRADES_BATCH_SIZE ?? 20,
});
const marketTradeNotificationRecoveryWindowMs = Math.max(1, toNumber(process.env.MARKET_TRADE_NOTIFICATION_RECOVERY_HOURS ?? 24)) * 60 * 60 * 1000;
const snapshotIntervalMs = Math.max(Number(process.env.SNAPSHOT_INTERVAL_MS ?? 30000), 10000);
const productionMissingGraceMs = Math.max(Number(process.env.PRODUCTION_MISSING_GRACE_MS ?? 120000), 0);
const dataDir = process.env.BITCRAFT_LOCAL_DATA_DIR ?? path.join(root, "data");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const appVersion = String(packageJson.version ?? "0.0.0-dev");
const appIdentifier = process.env.BITJITA_APP_IDENTIFIER ?? "BitCraft Claim Monitor (github.com/Red463/bitcraft-claim-monitor)";
const ipHash = createIpHasher(appIdentifier);
const changelogUrl = "https://github.com/Red463/bitcraft-claim-monitor/blob/main/CHANGELOG.md";
const changelogPath = path.resolve(root, "..", "..", "CHANGELOG.md");
const repoRoot = path.resolve(root, "..", "..");
const brandingDir = path.join(dataDir, "branding");
const backupDir = path.join(dataDir, "backups");
const geoipDir = path.join(dataDir, "geoip");
const geoipDataPath = process.env.GEOIP_DATA_PATH ?? path.join(geoipDir, "geoip.json");
const maxGeoipJsonFallbackBytes = 25 * 1024 * 1024;
const ipapiBaseUrl = String(process.env.IPAPI_BASE_URL ?? "https://ipapi.co").replace(/\/+$/, "");
mkdirSync(dataDir, { recursive: true });
mkdirSync(brandingDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });
mkdirSync(geoipDir, { recursive: true });

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// Scheduled jobs and Discord/background tasks intentionally run outside request
// lifetimes. A transient async failure must be logged and surfaced in admin
// diagnostics, but it must not terminate the whole Node process. An uncaught
// exception is different: mark the process failed so systemd restarts workers.
process.on("unhandledRejection", (reason) => {
  const detail = reason instanceof Error && reason.stack ? reason.stack : errorMessage(reason);
  console.error(`Unhandled async task failed: ${detail}`);
});

process.on("uncaughtException", (error) => {
  console.error(`Uncaught exception: ${error.stack ?? errorMessage(error)}`);
  process.exitCode = 1;
  setImmediate(() => process.exit(1));
});

const databasePath = path.join(dataDir, "bitcraft-local.sqlite");
const db = new DatabaseSync(databasePath);
applyDatabaseConnectionPragmas(db, { busyTimeoutMs: process.env.SQLITE_BUSY_TIMEOUT_MS ?? 5000 });
// SQLite is intentionally bootstrapped in-process because the app is designed to
// self-host as a single service. Tables below mix current cached records,
// append-only history, admin/auth state, Discord state, analytics, and scheduled
// job metadata. Schema changes should be additive unless a migration is called
// out clearly for production operators.
applySchemaBootstrap(db);
applyLegacySchemaCleanup(db);


applyAdditiveColumnMigrations(db);
applySchemaIndexStatements(db);

const now = new Date().toISOString();
applyDefaultAppSettings(db, { serverRefreshSeconds: Math.round(snapshotIntervalMs / 1000), updatedAt: now });

const statements = createPreparedStatements(db);

seedDefaultDiscordOwner({ db, statements, defaultOwnerDiscordId: defaultOwnerDiscordIdFromEnv(process.env), isTestRuntime });

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function upsertRecipeCatalogDetail(target, detail, source = "bitjita") {
  const normalized = recipeTargetFromDetail(detail, target);
  const now = new Date().toISOString();
  statements.upsertRecipeCatalogEntry.run(
    recipeCatalogKey(normalized.kind, normalized.id),
    normalized.kind,
    normalized.id,
    normalized.itemType,
    normalized.name,
    normalized.tier,
    normalized.rarity,
    normalized.tag,
    normalized.iconAssetName,
    JSON.stringify(detail),
    source,
    now,
    now,
  );
  return normalized;
}

async function fetchAndStoreRecipeDetail(target, source = "on_demand") {
  const kind = String(target.kind ?? "") === "cargo" ? "cargo" : "items";
  const id = String(target.id ?? "").trim();
  if (!id) {
    const error = new Error("Recipe target id is required");
    error.statusCode = 400;
    throw error;
  }
  const detail = await fetchBitjita(`/${kind}/${encodeURIComponent(id)}`);
  upsertRecipeCatalogDetail({ ...target, id, kind }, detail, source);
  return detail;
}

async function recipeDetailFromCatalogOrFetch(target) {
  const kind = String(target.kind ?? "") === "cargo" ? "cargo" : "items";
  const id = String(target.id ?? "").trim();
  const key = recipeCatalogKey(kind, id);
  const cached = statements.getRecipeCatalogEntry.get(key);
  if (cached?.detail_json) {
    return {
      detail: safeJson(cached.detail_json, {}),
      cached: true,
      lastSyncedAt: cached.last_synced_at,
      lastError: cached.last_error,
    };
  }
  const detail = await fetchAndStoreRecipeDetail({ ...target, id, kind }, "on_demand");
  return {
    detail,
    cached: false,
    lastSyncedAt: new Date().toISOString(),
    lastError: null,
  };
}

async function runRecipeCatalogRefreshJob() {
  const limit = Math.max(1, Math.min(Number(process.env.RECIPE_CATALOG_REFRESH_LIMIT ?? 250), 1000));
  const rows = statements.listRecipeCatalogEntries.all(limit);
  if (!rows.length) {
    return {
      refreshed: 0,
      failed: 0,
      skipped: 0,
      knownRecipes: 0,
      message: "No recipe records are cached yet. The Craft Calculator will add records as users look up items.",
    };
  }

  let refreshed = 0;
  let failed = 0;
  let stoppedEarly = false;
  for (const row of rows) {
    const target = recipeTargetFromRow(row);
    try {
      await fetchAndStoreRecipeDetail(target, "scheduled_job");
      refreshed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      statements.updateRecipeCatalogError.run(message, new Date().toISOString(), row.catalog_key);
      if (message.includes("HTTP 429")) {
        stoppedEarly = true;
        break;
      }
    }
    await delay(250);
  }

  const knownRecipes = toNumber(statements.recipeCatalogCount.get()?.count);
  return {
    refreshed,
    failed,
    skipped: Math.max(knownRecipes - refreshed - failed, 0),
    knownRecipes,
    stoppedEarly,
  };
}

function updateScheduledJobProgress(jobKey, metadata) {
  if (!jobKey) return;
  const row = statements.getScheduledJob.get(jobKey);
  const previous = safeJson(row?.metadata_json, {});
  const updatedAt = new Date().toISOString();
  statements.updateScheduledJobMetadata.run(JSON.stringify({ ...previous, ...metadata, progressUpdatedAt: updatedAt }), updatedAt, jobKey);
}

async function runGeoipRefreshJob({ jobKey } = {}) {
  const settings = visitorSecuritySettings(true);
  if (settings.geoipProvider === "ipapi") {
    updateScheduledJobProgress(jobKey, { stage: "provider_mode", provider: "ipapi", cacheEntries: toNumber(statements.visitorGeoipCacheCount.get()?.count) });
    return {
      refreshed: false,
      configured: true,
      provider: "ipapi",
      message: "ipapi provider mode uses on-demand cached lookups, so no local GeoIP database refresh is required.",
      cacheEntries: toNumber(statements.visitorGeoipCacheCount.get()?.count),
    };
  }
  if (settings.geoipProvider === "disabled") {
    return {
      refreshed: false,
      configured: false,
      provider: "disabled",
      message: "GeoIP lookup is disabled.",
    };
  }
  if (!settings.geoipSourceUrl) {
    return {
      refreshed: false,
      configured: false,
      message: "No GeoIP source URL is configured. Add a MaxMind GeoLite2 City CSV ZIP, JSON, or CSV update URL in Admin settings to enable automatic refreshes.",
    };
  }
  const headers = { "user-agent": appIdentifier };
  if (settings.geoipAccountId && settings.geoipLicenseKey) {
    headers.authorization = `Basic ${Buffer.from(`${settings.geoipAccountId}:${settings.geoipLicenseKey}`).toString("base64")}`;
  }
  let response;
  try {
    updateScheduledJobProgress(jobKey, { stage: "downloading", source: "GeoIP source URL" });
    response = await fetch(settings.geoipSourceUrl, { headers, signal: AbortSignal.timeout(120000) });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`GeoIP download failed before a response was received: ${reason}`);
  }
  if (!response.ok) throw new Error(`GeoIP download failed with HTTP ${response.status}`);
  updateScheduledJobProgress(jobKey, { stage: "reading_download", statusCode: response.status });
  const body = Buffer.from(await response.arrayBuffer());
  updateScheduledJobProgress(jobKey, { stage: "parsing", downloadedBytes: body.length });
  const contentType = response.headers.get("content-type") ?? "";
  const looksZip = body.length >= 4 && body.readUInt32LE(0) === 0x04034b50;
  let entriesCount = 0;
  let storage = "sqlite";
  if (looksZip || /zip/i.test(contentType)) {
    const result = await importMaxMindCityCsvZipToSqlite(body, (metadata) => updateScheduledJobProgress(jobKey, { downloadedBytes: body.length, storage, ...metadata }));
    entriesCount = result.entries;
    try {
      if (existsSync(geoipDataPath)) unlinkSync(geoipDataPath);
    } catch {}
  } else {
    mkdirSync(geoipDir, { recursive: true });
    const tempPath = `${geoipDataPath}.tmp`;
    storage = "json";
    const entries = parseGeoipDownload(body, contentType);
    if (!entries.length) throw new Error("GeoIP source did not contain any valid ranges");
    entriesCount = entries.length;
    updateScheduledJobProgress(jobKey, { stage: "writing", entries: entriesCount });
    await writeFile(tempPath, JSON.stringify({ updatedAt: new Date().toISOString(), ranges: entries, count: entriesCount }, null, 2));
    parseGeoipData(readFileSync(tempPath, "utf8"));
    renameSync(tempPath, geoipDataPath);
  }
  if (!entriesCount) throw new Error("GeoIP source did not contain any valid ranges");
  geoipCache = { mtimeMs: 0, entries: null, error: null };
  return {
    refreshed: true,
    configured: true,
    entries: entriesCount,
    storage,
    path: storage === "sqlite" ? databasePath : geoipDataPath,
  };
}

// Scheduled jobs are registered here rather than scattered through route
// handlers so Admin can expose a consistent enable/run/status surface for each
// background task. Jobs should report progress in metadata when they can run for
// longer than a normal request.
const scheduledJobRegistry = {
  recipe_catalog_refresh: {
    label: "Recipe catalog refresh",
    description: "Refreshes known Craft Calculator recipe records from BitJita once per day at midnight.",
    schedule: "daily_midnight",
    enabled: true,
    run: runRecipeCatalogRefreshJob,
  },
  regional_buy_order_sale_baselines_refresh: {
    label: "Regional buy-order sale baselines",
    description: "Refreshes 7-day confirmed-sale baselines for cached regional buy orders once per day.",
    schedule: "daily_midnight",
    enabled: true,
    run: runRegionalBuyOrderSaleBaselineRefreshJob,
  },
  youtube_channel_monitor: {
    label: "YouTube channel monitor",
    description: "Checks monitored YouTube channels for new videos and posts announcements to Discord.",
    schedule: "interval@600",
    enabled: true,
    run: runYouTubeChannelMonitorJob,
  },
  discord_app_update_announcer: {
    label: "Discord app update announcer",
    description: "Checks for newly deployed app versions and posts update notes to Discord.",
    schedule: "interval@300",
    enabled: true,
    run: runDiscordAppUpdateAnnouncementJob,
  },
  market_deal_watch: {
    label: "Market deal watch",
    description: "Checks watched Price Finder items for sell listings below confirmed regional sale averages.",
    schedule: "interval@1800",
    enabled: true,
    run: runMarketDealWatchJob,
  },
  geoip_database_refresh: {
    label: "GeoIP database refresh",
    description: "Refreshes the local visitor IP-to-location lookup file when local GeoIP mode is used. Provider mode resolves locations on demand with cache.",
    schedule: "weekly@1@00:00",
    enabled: false,
    run: runGeoipRefreshJob,
  },
};

function seedScheduledJobs() {
  seedScheduledJobsRegistry({ db, statements, registry: scheduledJobRegistry });
}

const scheduledJobStaleAfterMs = 15 * 60 * 1000;

function recoverStaleScheduledJobs() {
  return recoverStaleScheduledJobsRegistry({ statements, staleAfterMs: scheduledJobStaleAfterMs });
}

function scheduledJobRow(row) {
  return publicScheduledJobRow(row);
}

function scheduledJobsStatus() {
  return scheduledJobsStatusResponse({ enabled: scheduledJobsEnabled, statements, recoverStaleJobs: recoverStaleScheduledJobs });
}

async function runScheduledJob(jobKey, { manual = false } = {}) {
  // Manual and scheduled runs share the same lock/status path. This keeps a slow
  // job from stacking duplicate executions when an admin clicks Run Now while a
  // scheduled run is still active.
  recoverStaleScheduledJobs();
  const registryEntry = scheduledJobRegistry[jobKey];
  if (!registryEntry) {
    const error = new Error("Unknown scheduled job");
    error.statusCode = 404;
    throw error;
  }
  const row = statements.getScheduledJob.get(jobKey);
  if (!row) {
    const error = new Error("Scheduled job is not configured");
    error.statusCode = 404;
    throw error;
  }
  if (row.running) {
    const error = new Error("Scheduled job is already running");
    error.statusCode = 409;
    throw error;
  }
  const startedAt = new Date().toISOString();
  statements.markScheduledJobRunning.run(startedAt, startedAt, jobKey);
  try {
    const metadata = await registryEntry.run({ manual, jobKey });
    const finishedAt = new Date().toISOString();
    statements.markScheduledJobSuccess.run(finishedAt, nextScheduledRunIso(row.schedule, new Date()), JSON.stringify({ ...metadata, manual }), finishedAt, jobKey);
    return { ok: true, key: jobKey, metadata, nextRunAt: statements.getScheduledJob.get(jobKey)?.next_run_at };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    statements.markScheduledJobFailure.run(message, nextScheduledRunIso(row.schedule, new Date()), JSON.stringify({ manual }), finishedAt, jobKey);
    throw error;
  }
}

function checkScheduledJobs() {
  if (!scheduledJobsEnabled || isTestRuntime) return;
  const due = statements.dueScheduledJobs.all(new Date().toISOString());
  for (const row of due) {
    void runScheduledJob(row.job_key).catch((error) => console.warn(`Scheduled job ${row.job_key} failed: ${error instanceof Error ? error.message : String(error)}`));
  }
}

seedScheduledJobs();

function publicDiscordYouTubeChannel(row) {
  return row ? {
    channelId: String(row.channel_id ?? ""),
    input: String(row.input ?? ""),
    title: String(row.title ?? ""),
    url: String(row.url ?? ""),
    discordChannelId: String(row.discord_channel_id ?? ""),
    enabled: row.enabled !== 0,
    lastCheckedAt: row.last_checked_at ?? null,
    lastSuccessAt: row.last_success_at ?? null,
    lastError: row.last_error ?? null,
    lastVideoId: row.last_video_id ?? null,
    lastVideoTitle: row.last_video_title ?? null,
    lastVideoPublishedAt: row.last_video_published_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  } : null;
}

function discordYouTubeStatus(extra = {}) {
  const settings = getDiscordSettingsRaw();
  return {
    enabled: Boolean(settings.youtube?.enabled && settings.notify?.youtubeVideos),
    youtube: settings.youtube,
    announcementsChannelId: youtubeChannelSelection(settings) || "",
    channels: statements.listDiscordYouTubeChannels.all().map(publicDiscordYouTubeChannel),
    scheduledJob: scheduledJobRow(statements.getScheduledJob.get("youtube_channel_monitor")),
    ...extra,
  };
}

async function fetchYouTubeChannelFeed(channelId, fetchImpl = fetch) {
  const response = await fetchImpl(youtubeFeedUrl(channelId), { headers: { "user-agent": appIdentifier } });
  if (!response.ok) throw new Error(`YouTube feed HTTP ${response.status}`);
  return parseYouTubeFeed(await response.text());
}

function recordYouTubeVideo(channelId, video, seenAt, notifiedAt = null) {
  statements.insertDiscordYouTubeVideo.run(
    video.videoId,
    channelId,
    String(video.title ?? video.videoId),
    String(video.url ?? `https://www.youtube.com/watch?v=${video.videoId}`),
    String(video.thumbnailUrl ?? ""),
    String(video.publishedAt ?? ""),
    seenAt,
    notifiedAt,
  );
}

async function addDiscordYouTubeChannel(input) {
  const resolved = await resolveYouTubeChannelInput(input, fetch);
  const now = new Date().toISOString();
  const parsed = await fetchYouTubeChannelFeed(resolved.channelId);
  const latest = parsed.videos[0] ?? null;
  statements.upsertDiscordYouTubeChannel.run(
    resolved.channelId,
    String(input ?? "").trim(),
    parsed.channelTitle || resolved.channelId,
    `https://www.youtube.com/channel/${resolved.channelId}`,
    null,
    1,
    now,
    now,
    null,
    latest?.videoId ?? null,
    latest?.title ?? null,
    latest?.publishedAt ?? null,
    now,
    now,
  );
  for (const video of parsed.videos) recordYouTubeVideo(resolved.channelId, video, now, null);
  return discordYouTubeStatus({ added: publicDiscordYouTubeChannel(statements.getDiscordYouTubeChannel.get(resolved.channelId)), seededVideos: parsed.videos.length });
}

async function checkDiscordYouTubeChannel(channel, { limit = 3 } = {}) {
  const checkedAt = new Date().toISOString();
  try {
    const parsed = await fetchYouTubeChannelFeed(channel.channel_id);
    const seenRows = statements.listDiscordYouTubeVideosForChannel.all(channel.channel_id);
    const seenVideoIds = new Set(seenRows.map((row) => String(row.video_id)));
    const toNotify = youtubeVideosToNotify({ videos: parsed.videos, seenVideoIds, limit });
    for (const video of parsed.videos) {
      if (!seenVideoIds.has(video.videoId)) recordYouTubeVideo(channel.channel_id, video, checkedAt, null);
    }
    let sent = 0;
    for (const video of toNotify) {
      await enqueueDiscordActivity("youtube_video", `${parsed.channelTitle || channel.title || "YouTube"}: ${video.title}`, video.publishedAt || checkedAt, {
        channelId: channel.channel_id,
        channelTitle: parsed.channelTitle || channel.title || channel.channel_id,
        discordChannelId: channel.discord_channel_id,
        videoId: video.videoId,
        videoTitle: video.title,
        url: video.url,
        thumbnailUrl: video.thumbnailUrl,
        publishedAt: video.publishedAt,
      }, { sourceKey: `youtube_video:${video.videoId}` });
      recordYouTubeVideo(channel.channel_id, video, checkedAt, new Date().toISOString());
      sent += 1;
    }
    const latest = parsed.videos[0] ?? null;
    statements.updateDiscordYouTubeChannelStatus.run(parsed.channelTitle || null, `https://www.youtube.com/channel/${channel.channel_id}`, checkedAt, checkedAt, null, latest?.videoId ?? null, latest?.title ?? null, latest?.publishedAt ?? null, checkedAt, channel.channel_id);
    return { channelId: channel.channel_id, checked: true, videos: parsed.videos.length, notified: sent };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statements.updateDiscordYouTubeChannelStatus.run(null, null, checkedAt, null, message, null, null, null, checkedAt, channel.channel_id);
    return { channelId: channel.channel_id, checked: false, notified: 0, error: message };
  }
}

async function runYouTubeChannelMonitorJob({ channelId = "" } = {}) {
  const settings = getDiscordSettingsRaw();
  if (!settings.youtube?.enabled) return { skipped: true, reason: "YouTube monitoring is disabled" };
  const channels = statements.listDiscordYouTubeChannels.all().filter((channel) => channel.enabled !== 0 && (!channelId || String(channel.channel_id) === String(channelId)));
  const results = [];
  for (const channel of channels) results.push(await checkDiscordYouTubeChannel(channel));
  return { checked: results.length, notified: results.reduce((sum, result) => sum + toNumber(result.notified), 0), results };
}
function currentAppBuildId() {
  return resolveCurrentAppBuildId({ repoRoot });
}

function currentAppReleaseKey() {
  return resolveCurrentAppReleaseKey({ appVersion, buildId: currentAppBuildId() });
}

function currentAppAnnouncementKey() {
  return resolveCurrentAppAnnouncementKey({ appVersion });
}

function unwrap(payload, key, fallback) {
  if (Array.isArray(payload)) return payload;
  return payload?.[key] ?? fallback;
}

function recordProductionJobs(claimId, craftsPayload, occurredAt) {
  const jobs = unwrap(craftsPayload, "craftResults", []).map((job) => normalizeProductionJob(job, craftsPayload));
  const seen = new Set(jobs.map((job) => job.key));
  const activeRows = statements.activeProductionJobs.all(claimId);
  const existing = new Map(activeRows.map((row) => [row.job_key, row]));
  const existingByStableKey = new Map(activeRows.map((row) => [normalizeProductionJob(safeJson(row.raw_json)).key, row]));
  const hasProductionBaseline = toNumber(statements.productionJobCount.get(claimId)?.count) > 0;
  const pendingNotifications = [];
  const diagnostics = [{
    status: "debug",
    eventType: "production_poll",
    summary: `Production poll saw ${jobs.length} active craft${jobs.length === 1 ? "" : "s"}`,
    reason: hasProductionBaseline ? "Production baseline exists" : "First production baseline; start notifications are suppressed for this poll",
    metadata: discordDiagnosticContext("production_started", {
      claimId,
      activeCraftCount: jobs.length,
      activeKnownBeforePoll: existing.size,
      hasProductionBaseline,
      crafts: jobs.slice(0, 12).map((job) => ({
        key: job.key,
        label: job.label,
        crafterName: job.crafterName,
        skillName: job.skillName,
        professionKey: job.professionKey,
        tier: job.tier,
        totalXp: job.totalXp,
        progressPct: job.progressPct,
        totalEffort: job.totalEffort,
        remainingEffort: job.remainingEffort,
      })),
    }),
  }];

  for (const job of jobs) {
    let current = existing.get(job.key) ?? existingByStableKey.get(job.key);
    if (current && current.job_key !== job.key) {
      statements.rekeyProductionJob.run(job.key, current.job_key);
      current = { ...current, job_key: job.key };
      existing.set(job.key, current);
    }
    const firstSeen = current?.first_seen ?? occurredAt;
    const jobWithTiming = { ...job, firstSeen, lastSeen: occurredAt };
    statements.upsertProductionJob.run(job.key, claimId, job.label, job.buildingName, job.crafterName, firstSeen, occurredAt, JSON.stringify(job.raw));
    const startAlreadyNotified = current ? Boolean(current.start_notified) : false;
    if (startAlreadyNotified) {
      diagnostics.push({
        status: "debug",
        eventType: "production_started",
        summary: `Craft start already notified: ${job.label}`,
        reason: "Existing active craft row already has start_notified=1",
        metadata: discordDiagnosticContext("production_started", { ...jobWithTiming, existingFirstSeen: current.first_seen, existingLastSeen: current.last_seen }),
      });
    }
    if (!startAlreadyNotified && hasProductionBaseline) {
      const summary = `Craft started: ${job.label}`;
      statements.insertActivity.run(claimId, "production_started", summary, occurredAt, JSON.stringify(jobWithTiming));
      const skipReason = productionNotificationSkipReason("production_started", jobWithTiming);
      if (skipReason) {
        diagnostics.push({ status: "skipped", eventType: "production_started", summary, reason: skipReason, metadata: discordDiagnosticContext("production_started", jobWithTiming) });
      } else {
        pendingNotifications.push({ jobKey: job.key, sourceKey: `production_started:${job.key}`, eventType: "production_started", summary, occurredAt, metadata: jobWithTiming });
      }
      statements.markProductionStartNotified.run(job.key);
    }
  }

  for (const [key, current] of existing) {
    if (seen.has(key)) continue;
    const lastSeenMs = new Date(String(current.last_seen ?? "")).getTime();
    if (Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs < productionMissingGraceMs) {
      diagnostics.push({
        status: "debug",
        eventType: "production_completed",
        summary: `Craft missing briefly: ${current.label}`,
        reason: `Craft has been absent for less than ${Math.round(productionMissingGraceMs / 1000)} seconds; completion is delayed to avoid duplicate start notifications from transient API gaps`,
        metadata: discordDiagnosticContext("production_completed", { key, label: current.label, buildingName: current.building_name, crafterName: current.crafter_name, lastSeen: current.last_seen }),
      });
      continue;
    }
    statements.completeProductionJob.run(occurredAt, key);
    const job = { ...normalizeProductionJob(safeJson(current.raw_json)), key, label: current.label, buildingName: current.building_name, crafterName: current.crafter_name };
    const metadata = {
      key,
      label: current.label,
      buildingName: current.building_name,
      crafterName: current.crafter_name,
      ...job,
    };
    const summary = `Craft completed: ${current.label}`;
    statements.insertActivity.run(claimId, "production_completed", summary, occurredAt, JSON.stringify(metadata));
    const skipReason = productionNotificationSkipReason("production_completed", metadata);
    if (skipReason) {
      diagnostics.push({ status: "skipped", eventType: "production_completed", summary, reason: skipReason, metadata: discordDiagnosticContext("production_completed", metadata) });
    } else {
      pendingNotifications.push({ jobKey: key, sourceKey: `production_completed:${key}`, eventType: "production_completed", summary, occurredAt, metadata });
    }
  }
  return { pendingNotifications, diagnostics };
}

async function deliverProductionNotifications(pendingNotifications = []) {
  for (const notification of pendingNotifications) {
    try {
      await enqueueDiscordActivity(notification.eventType, notification.summary, notification.occurredAt, notification.metadata, { sourceKey: notification.sourceKey });
    } catch (error) {
      console.warn(`Discord production notification enqueue failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function getDiscordSettingsRaw() {
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const envToken = String(process.env.DISCORD_BOT_TOKEN ?? "").trim();
  const envChannelId = String(process.env.DISCORD_CHANNEL_ID ?? "").trim();
  const channelId = envChannelId || stored.channelId;
  return {
    ...stored,
    applicationId: String(process.env.DISCORD_APPLICATION_ID ?? stored.applicationId).trim(),
    publicKey: String(process.env.DISCORD_PUBLIC_KEY ?? stored.publicKey).trim(),
    guildId: String(process.env.DISCORD_GUILD_ID ?? stored.guildId).trim(),
    channelId,
    channels: { ...stored.channels, notifications: channelId },
    botToken: envToken || String(statements.getSecret.get("discord_bot_token")?.value ?? "").trim(),
    botTokenSource: envToken ? "environment" : statements.getSecret.get("discord_bot_token") ? "database" : "",
  };
}

function publicDiscordSettings() {
  const settings = getDiscordSettingsRaw();
  const { botToken, ...publicSettings } = settings;
  return {
    ...publicSettings,
    botTokenConfigured: Boolean(botToken),
    botTokenSource: settings.botTokenSource || null,
    interactionUrl: "/api/discord/interactions",
  };
}

function getCollectorSettings() {
  return normalizeCollectorSettings(safeJson(statements.getSetting.get("collector_settings_json")?.value, {}));
}

function migrateBuyOrderCollectorInterval() {
  const markerKey = "buy_order_baseline_split_migrated_at";
  if (statements.getSetting.get(markerKey)?.value) return;
  const now = new Date().toISOString();
  const source = safeJson(statements.getSetting.get("collector_settings_json")?.value, {});
  const current = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  const existingBuyOrders = current.buyOrders && typeof current.buyOrders === "object" ? current.buyOrders : {};
  statements.upsertSetting.run("collector_settings_json", JSON.stringify({
    ...current,
    buyOrders: {
      ...existingBuyOrders,
      intervalSeconds: 1800,
    },
  }), now);
  statements.upsertSetting.run(markerKey, now, now);
}

migrateBuyOrderCollectorInterval();

function marketDealWatchSettings() {
  return normalizeMarketDealWatchSettings(safeJson(statements.getSetting.get("market_deal_watch_json")?.value, {}));
}

function appPopupConfig() {
  return normalizePopupConfig(safeJson(statements.getSetting.get("app_popups_json")?.value, { popups: [] }));
}

function getSettings() {
  const theme = safeJson(statements.getSetting.get("theme_json")?.value, defaultTheme);
  const toastSettings = safeJson(statements.getSetting.get("toast_json")?.value, { marketListings: true, marketSales: true, production: true });
  const branding = safeJson(statements.getSetting.get("branding_json")?.value, {});
  const excludedMemberIds = safeJson(statements.getSetting.get("excluded_member_ids_json")?.value, []);
  const savedDefaultPage = statements.getSetting.get("default_page")?.value ?? DEFAULT_APP_PAGE;
  return {
    claimId: statements.getSetting.get("claim_id")?.value ?? defaultClaimId,
    syncUrl: statements.getSetting.get("bitcraft_sync_url")?.value ?? defaultSyncUrl,
    excludedMemberIds: normalizeStoredExcludedMemberIds(excludedMemberIds),
    theme: { ...defaultTheme, ...theme },
    refreshSeconds: normalizeSavedRefreshIntervalSeconds(statements.getSetting.get("refresh_seconds")?.value, 30),
    serverRefreshSeconds: normalizeSavedRefreshIntervalSeconds(statements.getSetting.get("server_refresh_seconds")?.value, Math.round(snapshotIntervalMs / 1000)),
    collectorSettings: getCollectorSettings(),
    defaultPage: validAppPage(savedDefaultPage) ? savedDefaultPage : DEFAULT_APP_PAGE,
    defaultRegion: statements.getSetting.get("default_region")?.value ?? "",
    additionalActiveRegions: statements.getSetting.get("active_region_overrides")?.value ?? "",
    toastSettings: { marketListings: true, marketSales: true, production: true, ...toastSettings },
    marketDealWatch: marketDealWatchSettings(),
    branding,
    snapshotRetentionDays: normalizeSavedSnapshotRetentionDays(statements.getSetting.get("snapshot_retention_days")?.value, 365),
    visitorSecurity: visitorSecuritySettings(),
    browserSnapshotsEnabled: false,
    discord: publicDiscordSettings(),
  };
}

const pollStatus = {
  enabled: serverPollingEnabled,
  intervalMs: normalizeSavedRefreshIntervalSeconds(statements.getSetting.get("server_refresh_seconds")?.value, Math.round(snapshotIntervalMs / 1000)) * 1000,
  running: false,
  nextRunAt: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastError: null,
  lastRunMetrics: null,
  collectors: Object.fromEntries(Object.entries(getCollectorSettings()).map(([key, value]) => [key, { ...value, intervalMs: value.intervalSeconds * 1000, lastAttemptAt: null, lastSuccessAt: null, lastError: null, durationMs: null, nextRunAt: null }])),
  storageLastAttemptAt: null,
  storageLastSuccessAt: null,
  storageLastError: null,
  storageRequests: 0,
  storageInserted: 0,
};

function serverRefreshIntervalMs() {
  const seconds = normalizeSavedRefreshIntervalSeconds(statements.getSetting.get("server_refresh_seconds")?.value, Math.round(snapshotIntervalMs / 1000));
  return seconds * 1000;
}

function refreshCollectorStatusSettings() {
  const settings = getCollectorSettings();
  for (const [key, value] of Object.entries(settings)) {
    setCollectorStatus(key, {
      label: value.label,
      enabled: serverPollingEnabled && value.enabled,
      intervalSeconds: value.intervalSeconds,
      intervalMs: value.intervalSeconds * 1000,
    });
  }
}

function setCollectorStatus(key, patch = {}) {
  const current = pollStatus.collectors[key] ?? { label: key, enabled: serverPollingEnabled };
  pollStatus.collectors[key] = { ...current, ...patch };
}

function collectorAttempt(key, step = "Starting") {
  setCollectorStatus(key, {
    lastAttemptAt: new Date().toISOString(),
    lastError: null,
    fetchDurationMs: null,
    fetchSteps: [],
    payloadWriteDurationMs: null,
    rowCount: null,
    tableCounts: null,
    running: true,
    currentStep: step,
    progressCurrent: null,
    progressTotal: null,
  });
  return Date.now();
}

function collectorProgress(key, step, progress = {}) {
  setCollectorStatus(key, {
    running: true,
    currentStep: step,
    progressCurrent: Number.isFinite(Number(progress.current)) ? Number(progress.current) : null,
    progressTotal: Number.isFinite(Number(progress.total)) ? Number(progress.total) : null,
  });
}

function collectorSuccess(key, startedAt) {
  setCollectorStatus(key, {
    lastSuccessAt: new Date().toISOString(),
    lastError: null,
    durationMs: Math.max(Date.now() - startedAt, 0),
    running: false,
    currentStep: null,
    progressCurrent: null,
    progressTotal: null,
  });
}

function collectorFailure(key, startedAt, error) {
  setCollectorStatus(key, {
    lastError: error instanceof Error ? error.message : String(error),
    durationMs: Math.max(Date.now() - startedAt, 0),
    running: false,
    currentStep: null,
    progressCurrent: null,
    progressTotal: null,
  });
}

function sideEffectCollectorDue(key, force = false) {
  if (force) return true;
  const settings = getCollectorSettings()[key];
  if (!settings || settings.enabled === false) return false;
  const lastSuccessAt = pollStatus.collectors[key]?.lastSuccessAt;
  if (!lastSuccessAt) return true;
  return Date.now() - new Date(lastSuccessAt).getTime() >= settings.intervalSeconds * 1000;
}
function blankCollectionMetrics() {
  return {
    startedAt: new Date().toISOString(),
    collectors: {},
    domainPayloadWriteDurationMs: null,
    currentTableCounts: {},
  };
}

function collectorMetric(metrics, key) {
  if (!metrics || !key) return null;
  metrics.collectors[key] ??= {
    fetchDurationMs: 0,
    fetchSteps: [],
    payloadWriteDurationMs: 0,
    tableCounts: {},
    rowCount: 0,
  };
  return metrics.collectors[key];
}

function recordCollectorFetch(metrics, key, label, durationMs, error = null) {
  const metric = collectorMetric(metrics, key);
  if (!metric) return;
  const roundedDuration = Math.max(Math.round(durationMs), 0);
  metric.fetchDurationMs += roundedDuration;
  metric.fetchSteps.push({
    label,
    durationMs: roundedDuration,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
  });
}

function recordCollectorPayloadWrite(metrics, domain, durationMs) {
  const key = payloadDomainCollector[domain];
  const metric = collectorMetric(metrics, key);
  if (!metric) return;
  metric.payloadWriteDurationMs += Math.max(Math.round(durationMs), 0);
}

async function timedCollectorFetch(metrics, key, label, load) {
  const startedAt = Date.now();
  collectorProgress(key, `Fetching ${label}`);
  try {
    const result = await load();
    recordCollectorFetch(metrics, key, label, Date.now() - startedAt);
    return result;
  } catch (error) {
    recordCollectorFetch(metrics, key, label, Date.now() - startedAt, error);
    throw error;
  }
}

function tableCount(table, claimId = "") {
  try {
    return toNumber(db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE claim_id = ?`).get(String(claimId ?? ""))?.count);
  } catch {
    return null;
  }
}

function collectorTableCounts(claimId) {
  return Object.fromEntries(Object.entries(collectorCurrentTables).map(([key, tables]) => {
    const tableCounts = Object.fromEntries(tables.map((table) => [table, tableCount(table, claimId)]));
    return [key, {
      tables: tableCounts,
      rowCount: Object.values(tableCounts).reduce((sum, count) => sum + (Number.isFinite(Number(count)) ? Number(count) : 0), 0),
    }];
  }));
}

function applyCollectionMetrics(metrics, collectorKeys, claimId, collectedAt) {
  if (!metrics) return;
  const counts = collectorTableCounts(claimId);
  metrics.completedAt = collectedAt;
  metrics.currentTableCounts = counts;
  for (const key of collectorKeys) {
    const metric = metrics.collectors[key] ?? {};
    const count = counts[key] ?? { tables: {}, rowCount: 0 };
    setCollectorStatus(key, {
      fetchDurationMs: Number.isFinite(Number(metric.fetchDurationMs)) ? Number(metric.fetchDurationMs) : null,
      fetchSteps: Array.isArray(metric.fetchSteps) ? metric.fetchSteps : [],
      payloadWriteDurationMs: Number.isFinite(Number(metric.payloadWriteDurationMs)) ? Number(metric.payloadWriteDurationMs) : null,
      tableCounts: count.tables,
      rowCount: count.rowCount,
    });
  }
  pollStatus.lastRunMetrics = metrics;
}


function getSessionUser(req) {
  return lookupHttpSessionUser({
    req,
    cookieName: ADMIN_SESSION_COOKIE_NAME,
    deleteExpiredSessions: statements.deleteExpiredSessions,
    userBySession: statements.adminBySession,
  });
}

function requireAdmin(req, res) {
  // All admin-only routes pass through this session lookup first. Permission
  // checks are layered separately so Discord-authenticated admins can have
  // narrower roles without weakening the authentication boundary.
  const user = getSessionUser(req);
  if (!user) {
    send(res, 401, { error: "Authentication required" });
    return null;
  }
  return user;
}

function audit(user, action, details = {}) {
  statements.insertAudit.run(user?.id ?? null, user?.username ?? "system", action, JSON.stringify(details), new Date().toISOString());
}

const adminLoginAttempts = createAdminLoginAttemptStore();
const empireScoutInflight = new Map();
const regionCache = new Map();
const regionClaimListCache = new Map();
const empireScoutCache = new Map();
let activeRegionsCache = null;
const claimDetailCache = new Map();
const playerDetailCache = new Map();
const craftContributionCache = new Map();
const passiveCraftsCache = new Map();
const playerDetailSummariesCache = new Map();
const playerDetailSummariesInflight = new Map();
const passiveCraftSummariesCache = new Map();
const passiveCraftSummariesInflight = new Map();
const productionCraftsCache = new Map();
const productionCraftsInflight = new Map();
let mapCatalogCache = null;
const dashboardDataCache = new Map();
const dashboardDataInflight = new Map();
const UPSTREAM_CACHE_TTL_MS = Math.max(1000, Number(process.env.BITJITA_PROXY_CACHE_MS ?? 15000));
const UPSTREAM_STALE_IF_ERROR_MS = Math.max(0, Number(process.env.BITJITA_PROXY_STALE_IF_ERROR_MS ?? 5 * 60 * 1000));
const UPSTREAM_CACHE_MAX_ENTRIES = Math.max(25, Number(process.env.BITJITA_PROXY_CACHE_MAX_ENTRIES ?? 300));
const BITJITA_FETCH_TIMEOUT_MS = Math.max(1000, Number(process.env.BITJITA_FETCH_TIMEOUT_MS ?? 15000));
const EMPIRE_SCOUT_CACHE_TTL_MS = Math.max(30_000, Number(process.env.EMPIRE_SCOUT_CACHE_TTL_MS ?? 2 * 60 * 1000));
const BITJITA_PROXY_TIMEOUT_MS = Math.max(1000, Number(process.env.BITJITA_PROXY_TIMEOUT_MS ?? 12000));
const SLOW_REQUEST_LOG_MS = Math.max(1000, Number(process.env.SLOW_REQUEST_LOG_MS ?? 8000));
const PRODUCTION_CRAFT_TIMEOUT_MS = Math.max(1000, Number(process.env.PRODUCTION_CRAFT_TIMEOUT_MS ?? 10000));
const PRODUCTION_MEMBER_CRAFT_TIMEOUT_MS = Math.max(1000, Number(process.env.PRODUCTION_MEMBER_CRAFT_TIMEOUT_MS ?? 6000));
const PLAYER_DETAIL_SUMMARY_CACHE_TTL_MS = Math.max(5000, Number(process.env.PLAYER_DETAIL_SUMMARY_CACHE_MS ?? 30_000));
const PASSIVE_CRAFT_SUMMARY_CACHE_TTL_MS = Math.max(5000, Number(process.env.PASSIVE_CRAFT_SUMMARY_CACHE_MS ?? 60_000));
const PRODUCTION_CRAFT_CACHE_TTL_MS = Math.max(5000, Number(process.env.PRODUCTION_CRAFT_CACHE_MS ?? 30_000));
const LOCAL_HELPER_STALE_IF_ERROR_MS = Math.max(0, Number(process.env.LOCAL_HELPER_STALE_IF_ERROR_MS ?? 5 * 60 * 1000));
const DASHBOARD_DATA_CACHE_TTL_MS = Math.max(5000, Number(process.env.DASHBOARD_DATA_CACHE_MS ?? 20_000));
const DASHBOARD_DATA_STALE_IF_ERROR_MS = Math.max(0, Number(process.env.DASHBOARD_DATA_STALE_IF_ERROR_MS ?? 5 * 60 * 1000));
const bitjitaProxyCache = createBitjitaProxyCache({
  appIdentifier,
  defaultTtlMs: UPSTREAM_CACHE_TTL_MS,
  staleIfErrorMs: UPSTREAM_STALE_IF_ERROR_MS,
  maxEntries: UPSTREAM_CACHE_MAX_ENTRIES,
  timeoutMs: BITJITA_PROXY_TIMEOUT_MS,
});

function visitorSecuritySettings(includeSecrets = false) {
  return normalizeVisitorSecuritySettings(safeJson(statements.getSetting.get("visitor_security_json")?.value, {}), { includeSecrets });
}

function ipv4ToNumber(ip) {
  const parts = String(ip).split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3]) >>> 0;
}

function ipv4CidrMatch(ip, cidr) {
  const [base, bitsText = "32"] = String(cidr).split("/");
  const bits = Number(bitsText);
  const ipNum = ipv4ToNumber(ip);
  const baseNum = ipv4ToNumber(base);
  if (ipNum == null || baseNum == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function ipv4CidrRange(cidr) {
  const [base, bitsText = "32"] = String(cidr).split("/");
  const bits = Number(bitsText);
  const baseNum = ipv4ToNumber(base);
  if (baseNum == null || !Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const start = (baseNum & mask) >>> 0;
  const size = 2 ** (32 - bits);
  const end = (start + size - 1) >>> 0;
  return { start, end };
}

let geoipCache = { mtimeMs: 0, entries: null, error: null };
const pendingProviderGeoipLookups = new Set();

function isLocalOrPrivateIpAddress(ip) {
  const normalized = normalizeIpAddress(ip);
  if (!normalized) return true;
  if (normalized === "127.0.0.1" || normalized === "0.0.0.0") return true;
  const ipNum = ipv4ToNumber(normalized);
  if (ipNum != null) {
    return ipv4CidrMatch(normalized, "10.0.0.0/8")
      || ipv4CidrMatch(normalized, "172.16.0.0/12")
      || ipv4CidrMatch(normalized, "192.168.0.0/16")
      || ipv4CidrMatch(normalized, "169.254.0.0/16");
  }
  const lower = normalized.toLowerCase();
  return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
}

function cacheProviderGeoipResult(ip, provider, country, city, error = null, ttlDays = 30) {
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + Math.max(ttlDays, 1) * 24 * 60 * 60 * 1000).toISOString();
  const key = ipHash(ip);
  statements.upsertVisitorGeoipCache.run(
    key,
    anonymizeIpAddress(ip),
    provider,
    country || "Unknown",
    city || "",
    nowIso,
    expiresAt,
    error,
  );
  if (!error && country && country !== "Unknown") {
    statements.updateVisitorSecurityLocationByIpHash.run(country, city || "", key);
  }
}

async function refreshProviderGeoip(ip, settings) {
  const normalized = normalizeIpAddress(ip);
  const key = ipHash(normalized);
  if (!normalized || isLocalOrPrivateIpAddress(normalized) || pendingProviderGeoipLookups.has(key)) return;
  pendingProviderGeoipLookups.add(key);
  try {
    const response = await fetch(`${ipapiBaseUrl}/${encodeURIComponent(normalized)}/json/`, {
      headers: { "user-agent": appIdentifier },
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error(String(payload.reason ?? payload.error));
    const country = String(payload.country_name || payload.country || "Unknown").trim() || "Unknown";
    const city = String(payload.city || "").trim();
    cacheProviderGeoipResult(normalized, "ipapi", country, city, null, settings.geoipCacheDays);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    cacheProviderGeoipResult(normalized, "ipapi", "Unknown", "", message, 1);
  } finally {
    pendingProviderGeoipLookups.delete(key);
  }
}

function parseGeoipData(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed.ranges) ? parsed.ranges : [];
    return entries.map((entry) => ({
      cidr: String(entry.cidr ?? entry.range ?? "").trim(),
      country: String(entry.country ?? entry.countryName ?? "Unknown").trim() || "Unknown",
      city: String(entry.city ?? entry.cityName ?? "").trim(),
    })).filter((entry) => entry.cidr);
  } catch {
    return trimmed.split(/\r?\n/).slice(1).map((line) => {
      const [cidr, country, city] = line.split(",").map((part) => part.trim());
      return { cidr, country: country || "Unknown", city: city || "" };
    }).filter((entry) => entry.cidr);
  }
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < String(line).length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseCsvRecords(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()]));
  });
}

function readZipEntries(buffer, shouldExtract = () => true) {
  const bytes = Buffer.from(buffer);
  const endSignature = 0x06054b50;
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (bytes.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("ZIP archive is missing an end-of-central-directory record");
  const totalEntries = bytes.readUInt16LE(endOffset + 10);
  const centralOffset = bytes.readUInt32LE(endOffset + 16);
  const entries = new Map();
  let pointer = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (bytes.readUInt32LE(pointer) !== 0x02014b50) throw new Error("ZIP archive has an invalid central directory");
    const compression = bytes.readUInt16LE(pointer + 10);
    const compressedSize = bytes.readUInt32LE(pointer + 20);
    const uncompressedSize = bytes.readUInt32LE(pointer + 24);
    const nameLength = bytes.readUInt16LE(pointer + 28);
    const extraLength = bytes.readUInt16LE(pointer + 30);
    const commentLength = bytes.readUInt16LE(pointer + 32);
    const localOffset = bytes.readUInt32LE(pointer + 42);
    const name = bytes.subarray(pointer + 46, pointer + 46 + nameLength).toString("utf8");
    if (!shouldExtract(name)) {
      pointer += 46 + nameLength + extraLength + commentLength;
      continue;
    }
    if (bytes.readUInt32LE(localOffset) !== 0x04034b50) throw new Error(`ZIP archive has an invalid local header for ${name}`);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (compression === 0) data = compressed;
    else if (compression === 8) data = inflateRawSync(compressed);
    else throw new Error(`ZIP entry ${name} uses unsupported compression method ${compression}`);
    if (uncompressedSize && data.length !== uncompressedSize) throw new Error(`ZIP entry ${name} has an unexpected size`);
    entries.set(name, data.toString("utf8"));
    pointer += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseMaxMindCityCsvZip(buffer) {
  const entries = readZipEntries(buffer, (name) => /GeoLite2-City-(Locations-en|Blocks-IPv4)\.csv$/i.test(name));
  const locationsEntry = [...entries.entries()].find(([name]) => /GeoLite2-City-Locations-en\.csv$/i.test(name));
  const blocksEntry = [...entries.entries()].find(([name]) => /GeoLite2-City-Blocks-IPv4\.csv$/i.test(name));
  if (!locationsEntry || !blocksEntry) throw new Error("GeoIP ZIP must contain GeoLite2-City-Locations-en.csv and GeoLite2-City-Blocks-IPv4.csv");
  const locations = new Map(parseCsvRecords(locationsEntry[1]).map((row) => [
    String(row.geoname_id ?? ""),
    {
      country: String(row.country_name || row.country_iso_code || "Unknown").trim() || "Unknown",
      city: String(row.city_name || "").trim(),
    },
  ]));
  return parseCsvRecords(blocksEntry[1]).map((row) => {
    const location = locations.get(String(row.geoname_id ?? "")) || locations.get(String(row.registered_country_geoname_id ?? "")) || {};
    return {
      cidr: String(row.network ?? "").trim(),
      country: String(location.country ?? "Unknown").trim() || "Unknown",
      city: String(location.city ?? "").trim(),
    };
  }).filter((entry) => entry.cidr);
}

function* csvLineIterator(text) {
  const source = String(text ?? "");
  let start = 0;
  for (let index = 0; index <= source.length; index += 1) {
    const char = source[index];
    if (index === source.length || char === "\n") {
      const line = source.slice(start, index).replace(/\r$/, "");
      start = index + 1;
      if (line.trim()) yield line;
    }
  }
}

function* csvRecordIterator(text) {
  const iterator = csvLineIterator(text);
  const first = iterator.next();
  if (first.done) return;
  const headers = parseCsvLine(first.value).map((header) => header.trim());
  for (const line of iterator) {
    const values = parseCsvLine(line);
    yield Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? "").trim()]));
  }
}

async function importMaxMindCityCsvZipToSqlite(buffer, progress = () => {}) {
  const zipEntries = readZipEntries(buffer, (name) => /GeoLite2-City-(Locations-en|Blocks-IPv4)\.csv$/i.test(name));
  const locationsEntry = [...zipEntries.entries()].find(([name]) => /GeoLite2-City-Locations-en\.csv$/i.test(name));
  const blocksEntry = [...zipEntries.entries()].find(([name]) => /GeoLite2-City-Blocks-IPv4\.csv$/i.test(name));
  if (!locationsEntry || !blocksEntry) throw new Error("GeoIP ZIP must contain GeoLite2-City-Locations-en.csv and GeoLite2-City-Blocks-IPv4.csv");
  progress({ stage: "indexing_locations" });
  const locations = new Map();
  let locationRows = 0;
  for (const row of csvRecordIterator(locationsEntry[1])) {
    const key = String(row.geoname_id ?? "");
    if (key) {
      locations.set(key, {
        country: String(row.country_name || row.country_iso_code || "Unknown").trim() || "Unknown",
        city: String(row.city_name || "").trim(),
      });
    }
    locationRows += 1;
    if (locationRows % 5000 === 0) {
      progress({ stage: "indexing_locations", locationRows });
      await delay(0);
    }
  }

  progress({ stage: "writing_ranges", locationRows, rangeRows: 0 });
  const updatedAt = new Date().toISOString();
  db.exec(`
    DROP TABLE IF EXISTS geoip_ranges_import;
    CREATE TABLE geoip_ranges_import (
      ip_start INTEGER NOT NULL,
      ip_end INTEGER NOT NULL,
      country TEXT NOT NULL,
      city TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (ip_start, ip_end)
    );
  `);
  const insertImportRange = db.prepare("INSERT OR IGNORE INTO geoip_ranges_import (ip_start, ip_end, country, city, updated_at) VALUES (?, ?, ?, ?, ?)");
  try {
    let count = 0;
    db.exec("BEGIN");
    for (const row of csvRecordIterator(blocksEntry[1])) {
      const cidr = String(row.network ?? "").trim();
      if (!cidr) continue;
      const range = ipv4CidrRange(cidr);
      if (!range) continue;
      const location = locations.get(String(row.geoname_id ?? "")) || locations.get(String(row.registered_country_geoname_id ?? "")) || {};
      insertImportRange.run(range.start, range.end, String(location.country ?? "Unknown").trim() || "Unknown", String(location.city ?? "").trim(), updatedAt);
      count += 1;
      if (count % 25000 === 0) {
        db.exec("COMMIT");
        progress({ stage: "writing_ranges", locationRows, rangeRows: count });
        db.exec("BEGIN");
        await delay(0);
      }
    }
    db.exec("COMMIT");
    db.exec(`
      DELETE FROM geoip_ranges;
      INSERT INTO geoip_ranges (ip_start, ip_end, country, city, updated_at)
      SELECT ip_start, ip_end, country, city, updated_at FROM geoip_ranges_import;
      DROP TABLE geoip_ranges_import;
    `);
    return { entries: count, locationRows };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    try {
      db.exec("DROP TABLE IF EXISTS geoip_ranges_import");
    } catch {}
    throw error;
  }
}

function parseGeoipDownload(body, contentType = "") {
  const buffer = Buffer.from(body);
  const looksZip = buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
  if (looksZip || /zip/i.test(contentType)) return parseMaxMindCityCsvZip(buffer);
  return parseGeoipData(buffer.toString("utf8"));
}

function geoipFileEntryCount() {
  if (!existsSync(geoipDataPath)) return 0;
  const stat = statSync(geoipDataPath);
  if (stat.size > maxGeoipJsonFallbackBytes) {
    geoipCache = {
      mtimeMs: stat.mtimeMs,
      entries: [],
      error: `GeoIP JSON fallback is too large to load safely (${Math.round(stat.size / 1024 / 1024)} MB). Run the GeoIP refresh again to import it into SQLite.`,
    };
    return 0;
  }
  const tailLength = Math.min(stat.size, 4096);
  if (!tailLength) return 0;
  const fd = openSync(geoipDataPath, "r");
  try {
    const buffer = Buffer.alloc(tailLength);
    readSync(fd, buffer, 0, tailLength, stat.size - tailLength);
    const tail = buffer.toString("utf8");
    const match = tail.match(/"count"\s*:\s*(\d+)/);
    if (match) return Number(match[1]);
  } finally {
    closeSync(fd);
  }
  return loadGeoipEntries().length;
}

function geoipStatus() {
  const settings = visitorSecuritySettings();
  if (settings.geoipProvider === "ipapi") {
    return {
      configured: true,
      provider: "ipapi",
      storage: "provider-cache",
      path: null,
      entries: toNumber(statements.visitorGeoipCacheCount.get()?.count),
      lastUpdatedAt: statements.visitorGeoipCacheLastLookup.get()?.looked_up_at ?? null,
      error: null,
    };
  }
  if (settings.geoipProvider === "disabled") {
    return { configured: false, provider: "disabled", storage: "disabled", path: null, entries: 0, lastUpdatedAt: null, error: null };
  }
  const sqliteEntries = toNumber(statements.geoipRangeCount.get()?.count);
  if (sqliteEntries > 0) {
    return {
      configured: true,
      provider: "local",
      storage: "sqlite",
      path: databasePath,
      entries: sqliteEntries,
      lastUpdatedAt: statements.geoipRangeLastUpdated.get()?.updated_at ?? null,
      error: geoipCache.error,
    };
  }
  if (!existsSync(geoipDataPath)) {
    return { configured: false, provider: "local", storage: "none", path: geoipDataPath, entries: 0, lastUpdatedAt: null, error: null };
  }
  try {
    const stat = statSync(geoipDataPath);
    if (stat.size > maxGeoipJsonFallbackBytes) {
      return {
        configured: false,
        storage: "json-skipped",
        path: geoipDataPath,
        entries: 0,
        lastUpdatedAt: new Date(stat.mtimeMs).toISOString(),
        error: `GeoIP JSON fallback is too large to load safely (${Math.round(stat.size / 1024 / 1024)} MB). Run the GeoIP refresh again to import it into SQLite.`,
      };
    }
    return { configured: true, provider: "local", storage: "json", path: geoipDataPath, entries: geoipFileEntryCount(), lastUpdatedAt: new Date(stat.mtimeMs).toISOString(), error: geoipCache.error };
  } catch (error) {
    return { configured: false, provider: "local", storage: "none", path: geoipDataPath, entries: 0, lastUpdatedAt: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function loadGeoipEntries() {
  if (!existsSync(geoipDataPath)) return [];
  const stat = statSync(geoipDataPath);
  if (stat.size > maxGeoipJsonFallbackBytes) {
    geoipCache = {
      mtimeMs: stat.mtimeMs,
      entries: [],
      error: `GeoIP JSON fallback is too large to load safely (${Math.round(stat.size / 1024 / 1024)} MB). Run the GeoIP refresh again to import it into SQLite.`,
    };
    return [];
  }
  if (geoipCache.entries && geoipCache.mtimeMs === stat.mtimeMs) return geoipCache.entries;
  try {
    const entries = parseGeoipData(readFileSync(geoipDataPath, "utf8"));
    geoipCache = { mtimeMs: stat.mtimeMs, entries, error: null };
    return entries;
  } catch (error) {
    geoipCache = { mtimeMs: stat.mtimeMs, entries: [], error: error instanceof Error ? error.message : String(error) };
    return [];
  }
}

function lookupGeoip(ipAddress) {
  const ip = normalizeIpAddress(ipAddress);
  const settings = visitorSecuritySettings();
  if (settings.geoipProvider === "disabled") return { country: "Unknown", city: "" };
  if (settings.geoipProvider === "ipapi") {
    if (isLocalOrPrivateIpAddress(ip)) return { country: "Unknown", city: "" };
    const cached = statements.getVisitorGeoipCache.get(ipHash(ip));
    if (cached && new Date(cached.expires_at).getTime() > Date.now()) {
      return { country: cached.country || "Unknown", city: cached.city || "" };
    }
    void refreshProviderGeoip(ip, settings).catch(() => {});
    return { country: "Unknown", city: "" };
  }
  const ipNum = ipv4ToNumber(ip);
  if (ipNum != null) {
    const row = statements.lookupGeoipRange.get(ipNum, ipNum);
    if (row) return { country: row.country || "Unknown", city: row.city || "" };
  }
  for (const entry of loadGeoipEntries()) {
    if (ipv4CidrMatch(ip, entry.cidr)) return { country: entry.country || "Unknown", city: entry.city || "" };
  }
  return { country: "Unknown", city: "" };
}

let lastVisitorSecurityPruneAt = 0;

function pruneVisitorSecurityEvents() {
  const settings = visitorSecuritySettings();
  const nowMs = Date.now();
  const fullIpBefore = new Date(nowMs - settings.fullIpRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const statsBefore = new Date(nowMs - settings.statsRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("UPDATE visitor_security_events SET ip_address = NULL WHERE occurred_at < ? AND ip_address IS NOT NULL").run(fullIpBefore);
  db.prepare("DELETE FROM visitor_security_events WHERE occurred_at < ?").run(statsBefore);
  statements.pruneVisitorGeoipCache.run(new Date(nowMs).toISOString());
  lastVisitorSecurityPruneAt = nowMs;
}

function recordVisitorSecurityEvent(req, pathname, statusCode) {
  // Visitor security logging is treated as legitimate-interest server telemetry:
  // it stores short-lived IP data for abuse investigation, then relies on hashed
  // and approximate geo fields for longer-term statistics.
  if (!shouldLogVisitor(pathname)) return;
  const nowIso = new Date().toISOString();
  if (Date.now() - lastVisitorSecurityPruneAt > 60 * 60 * 1000) pruneVisitorSecurityEvents();
  const ip = normalizeIpAddress(requestAddress(req));
  const anonymized = anonymizeIpAddress(ip);
  const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 500);
  const userAgentHash = userAgent ? createHash("sha256").update(userAgent).digest("hex") : null;
  const visitorKey = createHash("sha256").update(`${anonymized}|${userAgentHash ?? ""}`).digest("hex");
  const location = lookupGeoip(ip);
  statements.insertVisitorSecurityEvent.run(
    nowIso,
    String(req.method ?? "GET"),
    routeGroup(pathname),
    toNumber(statusCode) || 0,
    `${Math.floor((toNumber(statusCode) || 0) / 100)}xx`,
    ip || null,
    anonymized,
    ipHash(ip),
    visitorKey,
    userAgentHash,
    location.country,
    location.city,
  );
}

function visitorSecurityDashboard(params = new URLSearchParams()) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(`days=${encodeURIComponent(String(params ?? 30))}`);
  const selectedDays = [1, 7, 30, 90].includes(Number(query.get("days"))) ? Number(query.get("days")) : 30;
  const eventPageSize = Math.min(Math.max(Math.floor(toNumber(query.get("eventPageSize")) || 50), 10), 250);
  const eventPage = Math.max(Math.floor(toNumber(query.get("eventPage")) || 1), 1);
  const eventSearch = String(query.get("eventSearch") ?? "").trim().slice(0, 120);
  const eventStatus = String(query.get("eventStatus") ?? "").trim().slice(0, 3);
  const eventGroup = String(query.get("eventGroup") ?? "").trim().slice(0, 80);
  const since = new Date(Date.now() - selectedDays * 24 * 60 * 60 * 1000).toISOString();
  const totals = db.prepare(`
    SELECT COUNT(*) AS requests,
      COUNT(DISTINCT visitor_key) AS uniqueVisitors,
      COUNT(CASE WHEN status_code >= 400 THEN 1 END) AS errors
    FROM visitor_security_events WHERE occurred_at >= ?
  `).get(since);
  const locations = db.prepare(`
    SELECT COALESCE(country, 'Unknown') AS country, COALESCE(city, '') AS city,
      COUNT(*) AS requests, COUNT(DISTINCT visitor_key) AS visitors
    FROM visitor_security_events
    WHERE occurred_at >= ?
    GROUP BY COALESCE(country, 'Unknown'), COALESCE(city, '')
    ORDER BY requests DESC, visitors DESC
    LIMIT 30
  `).all(since);
  const routes = db.prepare(`
    SELECT route_group AS routeGroup, COUNT(*) AS requests, COUNT(CASE WHEN status_code >= 400 THEN 1 END) AS errors
    FROM visitor_security_events
    WHERE occurred_at >= ?
    GROUP BY route_group
    ORDER BY requests DESC
    LIMIT 20
  `).all(since);
  const recentWhere = ["occurred_at >= ?"];
  const recentArgs = [since];
  if (eventSearch) {
    const pattern = `%${escapeSqlLike(eventSearch)}%`;
    recentWhere.push(`(
      method LIKE ? ESCAPE '\\'
      OR route_group LIKE ? ESCAPE '\\'
      OR CAST(status_code AS TEXT) LIKE ? ESCAPE '\\'
      OR ip_address LIKE ? ESCAPE '\\'
      OR ip_anonymized LIKE ? ESCAPE '\\'
      OR country LIKE ? ESCAPE '\\'
      OR city LIKE ? ESCAPE '\\'
    )`);
    recentArgs.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }
  if (eventStatus) {
    recentWhere.push("CAST(status_code AS TEXT) LIKE ? ESCAPE '\\'");
    recentArgs.push(`${escapeSqlLike(eventStatus)}%`);
  }
  if (eventGroup) {
    recentWhere.push("route_group = ?");
    recentArgs.push(eventGroup);
  }
  const recentWhereSql = recentWhere.join(" AND ");
  const recentTotal = toNumber(db.prepare(`SELECT COUNT(*) AS count FROM visitor_security_events WHERE ${recentWhereSql}`).get(...recentArgs)?.count);
  const recentOffset = Math.min((eventPage - 1) * eventPageSize, Math.max(recentTotal - 1, 0));
  const recentRows = db.prepare(`
    SELECT id, occurred_at AS occurredAt, method, route_group AS routeGroup, status_code AS statusCode,
      ip_address AS ipAddress, ip_anonymized AS ipAnonymized, country, city
    FROM visitor_security_events
    WHERE ${recentWhereSql}
    ORDER BY occurred_at DESC, id DESC
    LIMIT ? OFFSET ?
  `).all(...recentArgs, eventPageSize, recentOffset);
  const retentionSettings = visitorSecuritySettings();
  return {
    days: selectedDays,
    retention: { ...retentionSettings, fullIpDays: retentionSettings.fullIpRetentionDays },
    geoip: geoipStatus(),
    totals,
    locations,
    routes,
    recent: {
      rows: recentRows,
      total: recentTotal,
      page: Math.floor(recentOffset / eventPageSize) + 1,
      pageSize: eventPageSize,
      search: eventSearch,
      status: eventStatus,
      group: eventGroup,
    },
  };
}



function requireAdminPermission(req, res, user, permission) {
  if (adminHasPermission(user, permission)) return true;
  send(res, 403, { error: `Administrator role does not allow ${permission.replace(".", " ")}` });
  return false;
}

function sameOriginRequest(req) {
  return requestSameOriginRequest(req, { isProduction });
}

function requireAdminMutation(req, res, user) {
  const rejection = adminMutationRejection(req, { isProduction });
  if (rejection) {
    send(res, 403, { error: rejection });
    return false;
  }
  return Boolean(user);
}

function createSession(userId) {
  const session = createHttpSession({
    cookieName: ADMIN_SESSION_COOKIE_NAME,
    maxAgeSeconds: ADMIN_SESSION_MAX_AGE_SECONDS,
    secure: isProduction,
  });
  statements.insertSession.run(session.tokenHash, userId, session.expiresAt, session.createdAt);
  return {
    token: session.token,
    cookie: session.cookie,
  };
}

function clearSession(req) {
  const token = sessionTokenFromRequest(req, ADMIN_SESSION_COOKIE_NAME);
  if (token) statements.deleteSession.run(sessionTokenHash(token));
  return clearHttpSessionCookie(ADMIN_SESSION_COOKIE_NAME, { secure: isProduction });
}

function originFromRequest(req) {
  return requestOriginFromRequest(req, { isProduction });
}

function discordOAuthConfig(req) {
  return resolveDiscordOAuthConfig({
    env: process.env,
    discordSettings: getDiscordSettingsRaw(),
    storedClientSecret: statements.getSecret.get("discord_oauth_client_secret")?.value,
    origin: originFromRequest(req),
  });
}

function getAppUser(req) {
  return lookupHttpSessionUser({
    req,
    cookieName: APP_USER_SESSION_COOKIE_NAME,
    deleteExpiredSessions: statements.deleteExpiredUserSessions,
    userBySession: statements.userBySession,
  });
}

function createAppUserSession(userId) {
  const session = createHttpSession({
    cookieName: APP_USER_SESSION_COOKIE_NAME,
    maxAgeSeconds: APP_USER_SESSION_MAX_AGE_SECONDS,
    secure: isProduction,
  });
  statements.insertUserSession.run(session.tokenHash, userId, session.expiresAt, session.createdAt);
  return {
    token: session.token,
    cookie: session.cookie,
  };
}

function clearAppUserSession(req) {
  const token = sessionTokenFromRequest(req, APP_USER_SESSION_COOKIE_NAME);
  if (token) statements.deleteAppUserSession.run(sessionTokenHash(token));
  return clearHttpSessionCookie(APP_USER_SESSION_COOKIE_NAME, { secure: isProduction });
}

function authStatus(req) {
  const user = getAppUser(req);
  const config = discordOAuthConfig(req);
  return { user: publicAppUser(user), discordLoginEnabled: config.enabled };
}

function createAdminSessionForDiscordProfile(profile, loginAt) {
  const discordId = String(profile.id ?? "").trim();
  if (!discordId) return null;
  const admin = statements.adminByDiscordId.get(discordId);
  if (!admin) return null;
  const username = discordProfileDisplayName(profile);
  statements.updateAdminDiscordProfile.run(
    username,
    String(profile.username ?? ""),
    String(profile.global_name ?? ""),
    String(profile.avatar ?? ""),
    loginAt,
    admin.id,
  );
  statements.insertLoginEvent.run(username, 1, loginAt, "discord-oauth");
  audit({ id: admin.id, username }, "admin.discord_login", { discordId });
  return createSession(admin.id);
}

function oauthStateSecret() {
  return resolveOAuthStateSecret({
    getSecret: statements.getSecret,
    upsertSecret: statements.upsertSecret,
  });
}

function authStateCookie(state, returnTo) {
  return oauthStateCookie(state, returnTo, { secret: oauthStateSecret(), secure: isProduction });
}

function clearAuthStateCookie() {
  return clearOAuthStateCookie({ secure: isProduction });
}

function readAuthStateCookie(req) {
  return readOAuthStateCookie(req, oauthStateSecret());
}

async function handleDiscordOAuthStart(req, res, url) {
  const config = discordOAuthConfig(req);
  if (!config.enabled) return send(res, 503, { error: "Discord login is not configured on this server" });
  const state = randomBytes(24).toString("base64url");
  const returnTo = url.searchParams.get("returnTo");
  res.writeHead(302, {
    location: buildDiscordAuthorizeUrl({ config, state }),
    "set-cookie": authStateCookie(state, returnTo),
  });
  res.end();
  return true;
}

async function handleDiscordOAuthCallback(req, res, url) {
  const config = discordOAuthConfig(req);
  const stateCookie = readAuthStateCookie(req);
  const state = String(url.searchParams.get("state") ?? "");
  const code = String(url.searchParams.get("code") ?? "");
  const error = String(url.searchParams.get("error") ?? "");
  const callbackDecision = discordOAuthCallbackDecision({ config, stateCookie, state, code, error });
  if (!callbackDecision.ok) {
    res.writeHead(302, { location: callbackDecision.location, "set-cookie": clearAuthStateCookie() });
    res.end();
    return true;
  }
  const returnTo = callbackDecision.returnTo;
  const tokenRequest = discordOAuthTokenRequest({ config, code: callbackDecision.code });
  const tokenResponse = await fetch(tokenRequest.url, tokenRequest.init);
  if (!tokenResponse.ok) throw new Error(`Discord OAuth token exchange failed: ${tokenResponse.status}`);
  const tokenJson = await tokenResponse.json();
  const profileRequest = discordOAuthProfileRequest(tokenJson.access_token);
  const profileResponse = await fetch(profileRequest.url, profileRequest.init);
  if (!profileResponse.ok) throw new Error(`Discord profile lookup failed: ${profileResponse.status}`);
  const profile = await profileResponse.json();
  const loginAt = new Date().toISOString();
  const account = discordOAuthProfileAccount(profile, loginAt);
  statements.upsertUserAccount.run(account.discordId, account.username, account.globalName, account.avatar, account.createdAt, account.lastLoginAt);
  const user = statements.userByDiscordId.get(account.discordId);
  statements.updateUserLastLogin.run(loginAt, user.id);
  const session = createAppUserSession(user.id);
  const adminSession = createAdminSessionForDiscordProfile(profile, loginAt);
  const redirect = discordOAuthSuccessRedirect({
    returnTo,
    clearStateCookie: clearAuthStateCookie(),
    userSessionCookie: session.cookie,
    adminSessionCookie: adminSession?.cookie,
  });
  res.writeHead(302, { location: redirect.location, "set-cookie": redirect.setCookie });
  res.end();
  return true;
}

function requireAppUser(req, res) {
  const user = getAppUser(req);
  if (!user) {
    send(res, 401, { error: "Discord sign-in required" });
    return null;
  }
  if (!sameOriginRequest(req)) {
    send(res, 403, { error: "Cross-origin account request rejected" });
    return null;
  }
  return user;
}

function adminStatus(req) {
  const setupRequired = toNumber(statements.adminCount.get()?.count) === 0;
  const user = getSessionUser(req);
  const discordConfig = discordOAuthConfig(req);
  return {
    setupRequired,
    setupKeyRequired: isProduction && setupRequired,
    authenticated: Boolean(user),
    user: publicAdminUser(user),
    csrfToken: user ? csrfToken(req) : null,
    roles: ADMIN_ROLE_LABELS,
    discordLoginEnabled: discordConfig.enabled,
    discordLoginUrl: `${originFromRequest(req)}/api/local/auth/discord/start?returnTo=${encodeURIComponent("/?page=admin")}`,
  };
}

function tableNames() {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .map((row) => row.name)
    .filter((name) => name !== "app_secrets");
}

function tableColumns(name) {
  if (!new Set(tableNames()).has(name)) throw new Error("Unknown table");
  return db.prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`).all().map((row) => String(row.name));
}

function tableInfo() {
  return tableNames().map((name) => {
    const safeName = name.replaceAll('"', '""');
    const columns = tableColumns(name);
    const timeColumn = ["occurred_at", "captured_at", "updated_at", "created_at"].find((column) => columns.includes(column));
    const latest = timeColumn ? db.prepare(`SELECT MAX("${timeColumn}") AS latest FROM "${safeName}"`).get()?.latest ?? null : null;
    return { name, rows: db.prepare(`SELECT COUNT(*) AS count FROM "${safeName}"`).get().count, latest };
  });
}

function tableQuery(name, params, exporting = false) {
  const allowed = new Set(tableNames());
  if (!allowed.has(name)) throw new Error("Unknown table");
  const columns = tableColumns(name);
  const safeName = name.replaceAll('"', '""');
  const search = String(params.search ?? "").trim();
  const dateFrom = String(params.dateFrom ?? "").trim();
  const dateTo = String(params.dateTo ?? "").trim();
  const orderBy = columns.includes(String(params.sort ?? "")) ? String(params.sort) : columns.includes("id") ? "id" : columns[0];
  const direction = String(params.direction ?? "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
  const timeColumn = ["occurred_at", "captured_at", "updated_at", "created_at"].find((column) => columns.includes(column));
  const clauses = [];
  const values = [];
  if (search) {
    clauses.push(`(${columns.map((column) => `CAST("${column.replaceAll('"', '""')}" AS TEXT) LIKE ?`).join(" OR ")})`);
    values.push(...columns.map(() => `%${search}%`));
  }
  if (dateFrom && timeColumn) {
    clauses.push(`"${timeColumn}" >= ?`);
    values.push(dateFrom);
  }
  if (dateTo && timeColumn) {
    clauses.push(`"${timeColumn}" <= ?`);
    values.push(`${dateTo}T23:59:59.999Z`);
  }
  const where = clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
  const total = db.prepare(`SELECT COUNT(*) AS count FROM "${safeName}"${where}`).get(...values).count;
  const limit = exporting ? Math.min(Math.max(Number(params.limit) || 10000, 1), 50000) : Math.min(Math.max(Number(params.limit) || 50, 1), 200);
  const offset = exporting ? 0 : Math.max(Number(params.offset) || 0, 0);
  const rows = db.prepare(`SELECT * FROM "${safeName}"${where} ORDER BY "${orderBy.replaceAll('"', '""')}" ${direction} LIMIT ? OFFSET ?`).all(...values, limit, offset);
  return { table: name, columns, rows: maskSensitiveTableRows(name, rows), total, limit, offset, timeColumn };
}

function maskSensitiveTableRows(name, rows) {
  if (name !== "app_settings") return rows;
  return rows.map((row) => {
    if (row?.key !== "visitor_security_json" || typeof row.value !== "string") return row;
    const value = safeJson(row.value, null);
    if (!value || typeof value !== "object") return row;
    return {
      ...row,
      value: JSON.stringify({
        ...value,
        geoipLicenseKey: value.geoipLicenseKey ? "[configured]" : "",
      }),
    };
  });
}

const analyticsEvents = new Set([
  "page_view",
  "page_duration",
  "member_details_opened",
  "market_tab_viewed",
  "market_member_filter_used",
  "price_finder_search",
  "price_finder_region_changed",
  "public_craft_map_opened",
  "public_craft_skill_filter_used",
  "public_craft_region_filter_used",
  "production_eligibility_filter_used",
  "activity_member_filter_used",
  "activity_category_filter_used",
]);
const analyticsPages = new Set(["dashboard", "leaderboard", "overview", "members", "skills", "production", "publiccrafts", "craftcalc", "inventory", "construction", "research", "market", "empire", "empires", "map", "sync", "activity"]);
const analyticsRetentionDays = 90;
let lastAnalyticsPruneAt = 0;

function recordAnalyticsEvent(body, req) {
  const eventName = String(body.eventName ?? "");
  const page = String(body.page ?? "");
  const cookies = parseCookies(req);
  if (cookies.claim_monitor_analytics_consent !== "accepted") throw new Error("Analytics consent is required");
  const visitorId = String(cookies.claim_monitor_analytics_visitor ?? "");
  const sessionId = String(body.sessionId ?? "");
  if (!analyticsEvents.has(eventName) || !analyticsPages.has(page)) throw new Error("Unknown analytics event");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(visitorId) || !/^[a-zA-Z0-9-]{16,80}$/.test(sessionId)) throw new Error("Invalid analytics identifier");
  const rawProperties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties) ? body.properties : {};
  const properties = Object.fromEntries(Object.entries(rawProperties)
    .filter(([key, value]) => /^[a-zA-Z_]{1,32}$/.test(key) && ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 6)
    .map(([key, value]) => [key, String(value).slice(0, 50)]));
  const durationSeconds = eventName === "page_duration" ? Math.min(Math.max(Math.round(toNumber(body.durationSeconds)), 1), 86400) : null;
  const visitorKey = createHash("sha256").update(visitorId).digest("hex");
  const sessionKey = createHash("sha256").update(sessionId).digest("hex");
  if (Date.now() - lastAnalyticsPruneAt > 24 * 60 * 60 * 1000) {
    const before = new Date(Date.now() - analyticsRetentionDays * 24 * 60 * 60 * 1000).toISOString();
    db.prepare("DELETE FROM analytics_events WHERE occurred_at < ?").run(before);
    lastAnalyticsPruneAt = Date.now();
  }
  statements.insertAnalyticsEvent.run(visitorKey, sessionKey, eventName, page, JSON.stringify(properties), durationSeconds, new Date().toISOString());
  return { ok: true };
}

function analyticsDashboard(days = 30) {
  const selectedDays = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const since = new Date(Date.now() - selectedDays * 24 * 60 * 60 * 1000).toISOString();
  const totals = db.prepare(`
    SELECT
      COUNT(CASE WHEN event_name = 'page_view' THEN 1 END) AS pageViews,
      COUNT(CASE WHEN event_name NOT IN ('page_view', 'page_duration') THEN 1 END) AS interactions,
      COUNT(DISTINCT visitor_key) AS visitors,
      COUNT(DISTINCT session_key) AS sessions,
      COALESCE(SUM(CASE WHEN event_name = 'page_duration' THEN duration_seconds ELSE 0 END), 0) AS durationSeconds
    FROM analytics_events WHERE occurred_at >= ?
  `).get(since);
  const pages = db.prepare(`
    SELECT page,
      COUNT(CASE WHEN event_name = 'page_view' THEN 1 END) AS pageViews,
      COUNT(DISTINCT visitor_key) AS visitors,
      COALESCE(SUM(CASE WHEN event_name = 'page_duration' THEN duration_seconds ELSE 0 END), 0) AS durationSeconds
    FROM analytics_events WHERE occurred_at >= ?
    GROUP BY page ORDER BY pageViews DESC, durationSeconds DESC LIMIT 20
  `).all(since);
  const features = db.prepare(`
    SELECT event_name AS eventName, COUNT(*) AS uses, COUNT(DISTINCT visitor_key) AS visitors
    FROM analytics_events
    WHERE occurred_at >= ? AND event_name NOT IN ('page_view', 'page_duration')
    GROUP BY event_name ORDER BY uses DESC, event_name ASC LIMIT 30
  `).all(since);
  const daily = db.prepare(`
    SELECT substr(occurred_at, 1, 10) AS day,
      COUNT(CASE WHEN event_name = 'page_view' THEN 1 END) AS pageViews,
      COUNT(DISTINCT visitor_key) AS visitors
    FROM analytics_events WHERE occurred_at >= ?
    GROUP BY substr(occurred_at, 1, 10) ORDER BY day ASC
  `).all(since);
  return { days: selectedDays, retentionDays: analyticsRetentionDays, totals, pages, features, daily };
}

function addActivity(claimId, eventType, summary, occurredAt, metadata = {}, sourceKey = null) {
  const result = sourceKey
    ? statements.insertSourcedActivity.run(claimId, eventType, summary, occurredAt, JSON.stringify(metadata), sourceKey)
    : statements.insertActivity.run(claimId, eventType, summary, occurredAt, JSON.stringify(metadata));
  if (result.changes > 0) queueDiscordActivity(claimId, eventType, summary, occurredAt, metadata);
}

function formatGold(value) {
  return `${Math.round(toNumber(value)).toLocaleString()}g`;
}

function formatDaysAndHours(days) {
  const value = toNumber(days);
  if (value <= 0) return "0 hours";
  const wholeDays = Math.floor(value);
  const hours = Math.round((value - wholeDays) * 24);
  if (wholeDays <= 0) return `${hours} hours`;
  if (hours <= 0) return `${wholeDays} days`;
  return `${wholeDays} days ${hours} hours`;
}

function supplyRunwayMetadata(claim, supplies = toNumber(claim?.supplies)) {
  const hourlyUpkeep = toNumber(claim?.upkeepCost) || toNumber(claim?.tileCost) * toNumber(claim?.numTiles);
  const dailyUpkeep = hourlyUpkeep * 24;
  const runOutDate = bitjitaTimestampIso(claim?.suppliesRunOut);
  const runwayDays = runOutDate && new Date(runOutDate).getTime() > Date.now()
    ? (new Date(runOutDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    : dailyUpkeep > 0 ? supplies / dailyUpkeep : 0;
  return {
    dailyUpkeep,
    runwayDays,
    runway: formatDaysAndHours(runwayDays),
    upkeep: dailyUpkeep ? `${dailyUpkeep.toLocaleString(undefined, { maximumFractionDigits: 2 })} supplies per day` : "Unknown",
    runsOutAt: runOutDate,
  };
}

function discordEnabledFor(eventType, settings, metadata) {
  if (!settings.enabled || !settings.botToken) return false;
  if (eventType === "market_new_listing") return false;
  if (eventType === "market_sale" || eventType === "market_sale_confirmed") {
    return settings.notify.marketSales && toNumber(metadata?.totalValue ?? metadata?.totalPrice ?? toNumber(metadata?.quantity) * toNumber(metadata?.price)) >= settings.minSaleValue;
  }
  if (eventType === "production_started") return settings.notify.production && settings.notify.productionStarted && productionNotificationAllowed(eventType, metadata, settings);
  if (eventType === "production_completed") return settings.notify.production && settings.notify.productionCompleted && productionNotificationAllowed(eventType, metadata, settings);
  if (eventType === "supplies") return !lowSupplyNotificationSkipReason(metadata, settings);
  if (eventType === "app_update") return settings.notify.appUpdates;
  if (eventType === "youtube_video") return settings.notify.youtubeVideos && Boolean(discordChannelForEvent(eventType, metadata, settings));
  return false;
}

function lowSupplyNotificationSkipReason(metadata = {}, settings = getDiscordSettingsRaw()) {
  if (!settings.notify.lowSupplies) return "Low supply notifications are disabled";
  const runwayDays = toNumber(metadata?.runwayDays);
  if (runwayDays <= 0) return "Supply runway is unknown";
  if (runwayDays >= settings.supplyRunwayDaysThreshold) {
    return `Supply runway ${runwayDays.toFixed(1)} days is above ${settings.supplyRunwayDaysThreshold} day threshold`;
  }
  const lastSent = statements.getSetting.get("discord_last_low_supplies_at")?.value ?? "";
  const lastSentMs = new Date(lastSent).getTime();
  if (Number.isFinite(lastSentMs) && Date.now() - lastSentMs < 24 * 60 * 60 * 1000) {
    const next = new Date(lastSentMs + 24 * 60 * 60 * 1000).toISOString();
    return `Low supply alert already sent today. Next alert available after ${next}`;
  }
  return "";
}

function productionNotificationSkipReason(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  if (!settings.notify.production) return "Craft notifications are disabled";
  if (eventType === "production_started" && !settings.notify.productionStarted) return "Craft started notifications are disabled";
  if (eventType === "production_completed" && !settings.notify.productionCompleted) return "Craft completed notifications are disabled";
  if (eventType === "production_started") {
    const firstSeenMs = new Date(String(metadata.firstSeen ?? metadata.first_seen ?? metadata.firstSeenAt ?? "")).getTime();
    const ageMinutes = Number.isFinite(firstSeenMs) ? (Date.now() - firstSeenMs) / 60000 : 0;
    if (ageMinutes < settings.productionMinAgeMinutes) return `Craft has been present for ${ageMinutes.toFixed(1)} minutes, below ${settings.productionMinAgeMinutes} minutes`;
  }
  if (toNumber(metadata.totalXp) < settings.productionMinXp) return `Total XP ${toNumber(metadata.totalXp).toLocaleString()} is below ${settings.productionMinXp.toLocaleString()}`;
  const allowedUsers = String(settings.productionUsers ?? "").split(/[\n,]/).map((name) => name.trim().toLowerCase()).filter(Boolean);
  if (allowedUsers.length) {
    const crafter = String(metadata.crafterName ?? "").trim().toLowerCase();
    if (!crafter) return `Allowed crafters are set, but BitJita did not provide a crafter name for this craft`;
    if (!allowedUsers.includes(crafter)) return `Crafter "${metadata.crafterName}" is not in allowed crafters: ${settings.productionUsers}`;
  }
  return "";
}

function productionNotificationAllowed(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  return !productionNotificationSkipReason(eventType, metadata, settings);
}

function youtubeChannelSelection(settings = getDiscordSettingsRaw()) {
  return resolveDiscordChannelSelection(settings.notificationChannels?.youtubeVideos ?? "announcements", settings, settings.channelId);
}

function discordChannelForEvent(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  if (eventType === "market_new_listing") return "";
  if ((eventType === "market_sale" || eventType === "market_sale_confirmed") && settings.marketSalesDelivery === "dm") return "";
  if (eventType === "youtube_video") {
    const overrideChannelId = String(metadata.discordChannelId ?? "").trim();
    return validDiscordId(overrideChannelId) ? overrideChannelId : youtubeChannelSelection(settings);
  }
  if (eventType === "production_started" || eventType === "production_completed") {
    const selection = settings.notificationChannels?.[eventType === "production_started" ? "productionStarted" : "productionCompleted"] ?? "profession";
    if (selection && selection !== "profession") return resolveDiscordChannelSelection(selection, settings, settings.channelId);
    const professionKey = String(metadata.professionKey ?? "").toLowerCase();
    return settings.craftChannels?.[professionKey] || settings.channelId;
  }
  const selection = eventType === "market_sale" || eventType === "market_sale_confirmed" ? "marketSales"
    : eventType === "supplies" ? "lowSupplies"
    : eventType === "app_update" ? "appUpdates"
    : "";
  if (selection) return resolveDiscordChannelSelection(settings.notificationChannels?.[selection], settings, settings.channelId);
  return settings.channelId;
}

function discordChannelKeyForEvent(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  if (eventType === "production_started" || eventType === "production_completed") {
    const selectionKey = eventType === "production_started" ? "productionStarted" : "productionCompleted";
    const selection = settings.notificationChannels?.[selectionKey] ?? "profession";
    if (selection === "profession") return normalizeProfessionKey(metadata.professionKey ?? metadata.skillName) || "profession";
    return selection;
  }
  if (eventType === "market_new_listing") return "disabled";
  if (eventType === "market_sale" || eventType === "market_sale_confirmed") return settings.marketSalesDelivery === "dm" ? "dm" : settings.notificationChannels?.marketSales ?? "notifications";
  if (eventType === "supplies") return settings.notificationChannels?.lowSupplies ?? "notifications";
  if (eventType === "supply_report") return settings.notificationChannels?.supplyReport ?? "modNotes";
  if (eventType === "app_update") return settings.notificationChannels?.appUpdates ?? "notifications";
  if (eventType === "youtube_video") return settings.notificationChannels?.youtubeVideos ?? "announcements";
  return "notifications";
}

function discordModLogTarget(settings = getDiscordSettingsRaw()) {
  const modLog = String(settings.channels?.modLog ?? "").trim();
  const modNotes = String(settings.channels?.modNotes ?? "").trim();
  if (modLog) return { channelId: modLog, channelKey: "modLog" };
  if (modNotes) return { channelId: modNotes, channelKey: "modNotes" };
  return { channelId: settings.channelId, channelKey: "notifications" };
}

function discordDiagnosticContext(eventType, metadata = {}, settings = getDiscordSettingsRaw()) {
  return {
    eventType,
    enabled: Boolean(settings.enabled),
    hasBotToken: Boolean(settings.botToken),
    channelId: discordChannelForEvent(eventType, metadata, settings) || "",
    channelKey: discordChannelKeyForEvent(eventType, metadata, settings),
    notify: settings.notify,
    minSaleValue: settings.minSaleValue,
    supplyRunwayDaysThreshold: settings.supplyRunwayDaysThreshold,
    productionMinXp: settings.productionMinXp,
    productionMinAgeMinutes: settings.productionMinAgeMinutes,
    productionUsers: settings.productionUsers,
    craftRoleId: craftWatchRole(metadata, settings)?.roleId ?? "",
    metadata,
  };
}

async function sendDiscordCharacterLinkRequest(userRow, metadata = {}, settings = getDiscordSettingsRaw()) {
  const eventType = "character_link_request";
  const { channelId, channelKey } = discordModLogTarget(settings);
  const accountName = String(userRow.discord_global_name || userRow.discord_username || "Discord user");
  const characterName = String(metadata.characterName || userRow.character_name || "Unknown character");
  const characterPlayerId = String(metadata.characterPlayerId || userRow.character_player_id || "");
  const diagnostics = {
    eventType,
    enabled: Boolean(settings.enabled),
    hasBotToken: Boolean(settings.botToken),
    channelId,
    channelKey,
    discordId: String(userRow.discord_id ?? ""),
    discordUsername: String(userRow.discord_username ?? ""),
    characterName,
    characterPlayerId,
    accountId: userRow.id,
  };
  if (!settings.enabled || !settings.botToken || !channelId) {
    const reason = "Discord disabled, bot token missing, or mod-log channel not configured";
    recordDiscordDeliverySafe({
      status: "skipped",
      eventType,
      channelId,
      channelKey,
      summary: `Character link requested: ${characterName}`,
      reason,
      metadata: diagnostics,
    });
    return { ok: true, skipped: true, reason, channelId, channelKey };
  }
  try {
    const response = await sendDiscordMessage({
      embeds: [discordCommandEmbed("Character Link Review", `**${accountName}** requested a BitCraft character link.`, [
        { name: "Discord", value: `<@${userRow.discord_id}>`, inline: true },
        { name: "Character", value: characterName, inline: true },
        { name: "Player ID", value: characterPlayerId || "Not provided", inline: false },
        { name: "Admin action", value: "Open Admin -> Linked Accounts to approve or reject this request.", inline: false },
      ], 0x56d5ff)],
      allowed_mentions: { parse: [] },
    }, settings, channelId);
    recordDiscordDeliverySafe({
      status: "sent",
      eventType,
      channelId,
      channelKey,
      summary: `Character link requested: ${characterName}`,
      metadata: diagnostics,
      response: { id: response?.id, channel_id: response?.channel_id },
    });
    return { ok: true, skipped: false, channelId, channelKey, response: { id: response?.id, channel_id: response?.channel_id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({
      status: "failed",
      eventType,
      channelId,
      channelKey,
      summary: `Character link requested: ${characterName}`,
      error: message,
      metadata: diagnostics,
    });
    return { ok: false, error: message };
  }
}

function recordDiscordDelivery(status) {
  const occurredAt = new Date().toISOString();
  const record = { ...status, at: occurredAt };
  statements.upsertSetting.run("discord_last_delivery_json", JSON.stringify(record), occurredAt);
  statements.insertDiscordDelivery.run(
    String(status.eventType ?? "unknown"),
    String(status.status ?? "unknown"),
    status.summary ? String(status.summary) : null,
    status.channelId ? String(status.channelId) : null,
    status.channelKey ? String(status.channelKey) : null,
    status.reason ? String(status.reason) : null,
    status.error ? String(status.error) : null,
    JSON.stringify(status.metadata ?? status.details ?? {}),
    status.response ? JSON.stringify(status.response) : null,
    occurredAt,
  );
  statements.pruneDiscordDeliveries.run();
}

function recordDiscordDeliverySafe(status) {
  try {
    recordDiscordDelivery(status);
  } catch (error) {
    console.warn(`Discord diagnostic log failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function craftWatchProfession(metadata = {}) {
  const key = normalizeProfessionKey(metadata.professionKey ?? metadata.skillName);
  const name = String((metadata.skillName ?? metadata.professionName ?? key) || "Profession").trim();
  return { key, name };
}

function professionLabel(key) {
  const normalized = normalizeProfessionKey(key);
  if (!normalized) return "Profession";
  if (normalized === "leatherworking") return "Leatherworking";
  return `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}

function craftWatchRole(metadata = {}, settings = getDiscordSettingsRaw()) {
  const { key } = craftWatchProfession(metadata);
  const roleId = key ? String(settings.craftRoles?.[key] ?? "").trim() : "";
  return roleId ? { key, roleId, mention: `<@&${roleId}>` } : null;
}

function discordCraftWatchComponents(eventType, metadata = {}) {
  if (eventType !== "production_started" && eventType !== "production_completed") return undefined;
  const { key, name } = craftWatchProfession(metadata);
  if (!key) return undefined;
  const label = name.length > 22 ? `${name.slice(0, 19)}...` : name;
  return [{
    type: 1,
    components: [
      { type: 2, style: 1, custom_id: `craftwatch:watch:${key}:${encodeURIComponent(name).slice(0, 80)}`, label: `Toggle ${label} Notifications` },
    ],
  }];
}

function isMarketSaleDiscordEvent(eventType) {
  return eventType === "market_sale" || eventType === "market_sale_confirmed";
}

async function sendDiscordMarketSaleDirectMessages(eventType, summary, occurredAt, metadata = {}, settings = getDiscordSettingsRaw(), diagnostics = {}) {
  const decision = marketSaleDiscordRecipientDecision(metadata, statements.listUserAccounts.all());
  const recipients = decision.recipients;
  if (!recipients.length) {
    const reason = decision.optedOut > 0 ? "Verified linked sale owner opted out of Discord market sale DMs" : "No verified linked Discord account matched sale owner";
    recordDiscordDeliverySafe({ status: "skipped", eventType, channelKey: "dm", summary, reason, metadata: { ...diagnostics, matchedRecipients: decision.matched, optedOutRecipients: decision.optedOut } });
    return { ok: true, skipped: true, reason, channelKey: "dm" };
  }
  const payload = {
    embeds: [discordEmbedForActivity(eventType, summary, occurredAt, metadata)],
    allowed_mentions: { parse: [] },
  };
  const responses = [];
  for (const recipientId of recipients) {
    const response = await sendDiscordDirectMessage(recipientId, payload, settings);
    responses.push({ recipientId, id: response?.id, channel_id: response?.channel_id });
  }
  recordDiscordDeliverySafe({
    status: "sent",
    eventType,
    channelKey: "dm",
    summary,
    metadata: { ...diagnostics, matchedRecipients: decision.matched, optedOutRecipients: decision.optedOut, recipientIds: recipients },
    response: { count: responses.length, responses },
  });
  return { ok: true, skipped: false, channelKey: "dm", response: { count: responses.length } };
}

async function sendDiscordActivity(eventType, summary, occurredAt, metadata = {}, settings = getDiscordSettingsRaw()) {
  const channelId = discordChannelForEvent(eventType, metadata, settings);
  const channelKey = discordChannelKeyForEvent(eventType, metadata, settings);
  const diagnostics = discordDiagnosticContext(eventType, metadata, settings);
  if (!discordEnabledFor(eventType, settings, metadata)) {
    const reason = eventType === "production_started" || eventType === "production_completed"
      ? productionNotificationSkipReason(eventType, metadata, settings) || "Craft notification disabled by settings"
      : eventType === "supplies" ? lowSupplyNotificationSkipReason(metadata, settings) || "Low supply notification disabled or above threshold"
      : eventType === "app_update" ? "App update notifications are disabled"
      : eventType === "youtube_video" ? "YouTube notifications are disabled or the announcements channel is not configured"
      : eventType === "market_new_listing" ? "Market listing Discord notifications are disabled"
      : "Notification disabled or below configured threshold";
    recordDiscordDeliverySafe({ status: "skipped", eventType, channelId, channelKey, summary, reason, metadata: diagnostics });
    return { ok: true, skipped: true, reason, channelId, channelKey };
  }
  try {
    if (isMarketSaleDiscordEvent(eventType) && settings.marketSalesDelivery === "dm") {
      return await sendDiscordMarketSaleDirectMessages(eventType, summary, occurredAt, metadata, settings, diagnostics);
    }
    const role = craftWatchRole(metadata, settings);
    const response = await sendDiscordMessage({
      content: role?.mention,
      embeds: [discordEmbedForActivity(eventType, summary, occurredAt, metadata)],
      components: discordCraftWatchComponents(eventType, metadata),
      allowed_mentions: { roles: role ? [role.roleId] : [], parse: [] },
    }, settings, channelId);
    recordDiscordDeliverySafe({ status: "sent", eventType, channelId, channelKey, summary, metadata: diagnostics, response: { id: response?.id, channel_id: response?.channel_id } });
    if (eventType === "supplies") statements.upsertSetting.run("discord_last_low_supplies_at", new Date().toISOString(), new Date().toISOString());
    return { ok: true, skipped: false, channelId, channelKey, response: { id: response?.id, channel_id: response?.channel_id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({ status: "failed", eventType, channelId, channelKey, summary, error: message, metadata: diagnostics });
    throw error;
  }
}

function discordOutboxSourceKey(eventType, summary, occurredAt, metadata = {}) {
  const stable = metadata.sourceKey ?? metadata.videoId ?? metadata.releaseKey ?? metadata.key ?? metadata.jobKey ?? "";
  return `${eventType}:${String(stable || `${summary}:${occurredAt}`).slice(0, 240)}`;
}

async function enqueueDiscordActivity(eventType, summary, occurredAt, metadata = {}, options = {}) {
  const now = new Date().toISOString();
  const sourceKey = String(options.sourceKey ?? discordOutboxSourceKey(eventType, summary, occurredAt, metadata));
  statements.enqueueDiscordNotification.run(sourceKey, eventType, summary, occurredAt, JSON.stringify(metadata ?? {}), now, now, now);
  void processDiscordNotificationOutbox().catch((error) => console.warn(`Discord notification outbox failed: ${error instanceof Error ? error.message : String(error)}`));
  return { ok: true, queued: true, sourceKey };
}

function discordNotificationRetryAt(attempts) {
  const delayMs = Math.min(5 * 60 * 1000, Math.max(5000, 5000 * (attempts + 1)));
  return new Date(Date.now() + delayMs).toISOString();
}

async function processDiscordNotificationOutbox({ limit = 10 } = {}) {
  if (discordNotificationOutboxRunning) return { skipped: true, reason: "Discord notification outbox already running" };
  discordNotificationOutboxRunning = true;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  try {
    const rows = statements.pendingDiscordNotifications.all(discordNotificationMaxAttempts, new Date().toISOString(), limit);
    for (const row of rows) {
      const metadata = safeJson(row.metadata_json, {});
      try {
        const result = await sendDiscordActivity(row.event_type, row.summary, row.occurred_at, metadata);
        const finishedAt = new Date().toISOString();
        if (result?.skipped) {
          statements.markDiscordNotificationSkipped.run(finishedAt, result.reason ?? "Notification skipped by sender", finishedAt, row.id);
          skipped += 1;
        } else {
          statements.markDiscordNotificationSent.run(finishedAt, JSON.stringify(result ?? {}), finishedAt, row.id);
          if (row.event_type === "app_update" && (metadata.announcementKey || metadata.version || metadata.releaseKey)) statements.upsertSetting.run("discord_last_announced_version", String(metadata.announcementKey || metadata.version || metadata.releaseKey), finishedAt);
          sent += 1;
        }
      } catch (error) {
        const failedAt = new Date().toISOString();
        const message = error instanceof Error ? error.message : String(error);
        statements.markDiscordNotificationFailed.run(discordNotificationMaxAttempts, discordNotificationRetryAt(toNumber(row.attempts)), failedAt, message, failedAt, row.id);
        failed += 1;
      }
    }
    return { checked: rows.length, sent, skipped, failed };
  } finally {
    discordNotificationOutboxRunning = false;
  }
}
function discordEmbedForActivity(eventType, summary, occurredAt, metadata = {}) {
  const tierColors = {
    1: 0x838e9e,
    2: 0xbe6327,
    3: 0x00f630,
    4: 0x2d6bff,
    5: 0xa349af,
    6: 0xd12234,
    7: 0xc09015,
    8: 0x5ae2e2,
    9: 0x1f1f1f,
    10: 0xdeffff,
  };
  const isProduction = eventType === "production_started" || eventType === "production_completed";
  const tier = isProduction ? toNumber(metadata.tier ?? metadata.itemTier) : 0;
  const color = eventType.includes("sale") ? 0x4ee28a : eventType.includes("listing") ? 0xf0c64f : isProduction && tierColors[tier] ? tierColors[tier] : isProduction ? 0x65b7fa : eventType === "app_update" ? 0xa349af : eventType === "youtube_video" ? 0xff0033 : 0xef6461;
  const fields = [];
  if (metadata.itemName) fields.push({ name: "Item", value: String(metadata.itemName), inline: true });
  if (metadata.owner) fields.push({ name: "Member", value: String(metadata.owner), inline: true });
  if (toNumber(metadata.quantity)) fields.push({ name: "Quantity", value: toNumber(metadata.quantity).toLocaleString(), inline: true });
  if (toNumber(metadata.price)) fields.push({ name: "Unit price", value: formatGold(metadata.price), inline: true });
  if (toNumber(metadata.totalValue ?? metadata.totalPrice)) fields.push({ name: "Total", value: formatGold(metadata.totalValue ?? metadata.totalPrice), inline: true });
  if (metadata.buildingName) fields.push({ name: "Structure", value: String(metadata.buildingName), inline: true });
  if (metadata.crafterName) fields.push({ name: "Crafter", value: String(metadata.crafterName), inline: true });
  if (metadata.skillName) fields.push({ name: "Profession", value: String(metadata.skillName), inline: true });
  if (isProduction && tier) fields.push({ name: "Tier", value: `T${tier}`, inline: true });
  if (toNumber(metadata.totalXp)) fields.push({ name: "Total XP", value: toNumber(metadata.totalXp).toLocaleString(), inline: true });
  if (toNumber(metadata.progressPct)) fields.push({ name: "Progress", value: `${toNumber(metadata.progressPct).toFixed(1)}%`, inline: true });
  if (metadata.runway) fields.push({ name: "Runway", value: String(metadata.runway), inline: true });
  if (metadata.upkeep) fields.push({ name: "Upkeep", value: String(metadata.upkeep), inline: true });
  if (metadata.runsOutAt) fields.push({ name: "Runs out", value: new Date(metadata.runsOutAt).toLocaleString("en-GB", { timeZone: "Europe/London" }), inline: false });
  if (metadata.version) fields.push({ name: "Version", value: String(metadata.version), inline: true });
  if (metadata.changeNotes) fields.push({ name: "Changes", value: String(metadata.changeNotes).slice(0, 1024), inline: false });
  if (metadata.changelogUrl) fields.push({ name: "Changelog", value: `[View changes](${metadata.changelogUrl})`, inline: false });
  if (metadata.channelTitle) fields.push({ name: "Channel", value: String(metadata.channelTitle), inline: true });
  if (metadata.publishedAt) fields.push({ name: "Published", value: new Date(metadata.publishedAt).toLocaleString("en-GB", { timeZone: "Europe/London" }), inline: true });
  const title = eventType === "market_new_listing" ? "Market Listing"
    : eventType.includes("sale") ? "Market Sale"
    : eventType === "production_started" ? "Craft Started"
    : eventType === "production_completed" ? "Craft Completed"
    : eventType === "supplies" ? "Supply Watch"
    : eventType === "app_update" ? "App Update"
    : eventType === "youtube_video" ? "New YouTube Video"
    : "Settlement Update";
  return {
    author: { name: "Timbersteel Trade" },
    title,
    url: metadata.url ?? metadata.changelogUrl,
    description: `**${summary}**`,
    color,
    fields: fields.slice(0, 8),
    timestamp: occurredAt,
    footer: { text: "BitCraft settlement monitor" },
    ...(metadata.thumbnailUrl ? { thumbnail: { url: String(metadata.thumbnailUrl) } } : {}),
  };
}

function queueDiscordActivity(claimId, eventType, summary, occurredAt, metadata = {}) {
  void enqueueDiscordActivity(eventType, summary, occurredAt, metadata, { sourceKey: `${eventType}:${claimId}:${metadata.sourceKey ?? metadata.id ?? summary}` }).catch((error) => console.warn(`Discord notification enqueue failed: ${error instanceof Error ? error.message : String(error)}`));
}

async function sendDiscordMessage(payload, settings = getDiscordSettingsRaw(), channelId = settings.channelId) {
  if (!settings.enabled || !settings.botToken || !channelId) throw new Error("Discord integration is not fully configured");
  const response = await fetch(`https://discord.com/api/v10/channels/${encodeURIComponent(channelId)}/messages`, {
    method: "POST",
    headers: {
      authorization: `Bot ${settings.botToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

async function sendDiscordDirectMessage(userId, payload, settings = getDiscordSettingsRaw()) {
  if (!settings.enabled || !settings.botToken || !/^\d+$/.test(String(userId))) throw new Error("Discord integration is not fully configured");
  const channel = await discordApiRequest("/users/@me/channels", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipient_id: String(userId) }),
  }, settings);
  if (!channel?.id) throw new Error("Discord did not return a DM channel.");
  return sendDiscordMessage(payload, settings, channel.id);
}

async function editDiscordMessage(channelId, messageId, payload, settings = getDiscordSettingsRaw()) {
  if (!settings.enabled || !settings.botToken || !channelId || !messageId) throw new Error("Discord integration is not fully configured");
  return discordApiRequest(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, settings);
}

async function sendOrUpdateDiscordMessage(channelId, messageId, payload, settings = getDiscordSettingsRaw()) {
  if (messageId) {
    try {
      const response = await editDiscordMessage(channelId, messageId, payload, settings);
      return { response, action: "updated" };
    } catch (error) {
      console.warn(`Discord message update failed, posting replacement: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const response = await sendDiscordMessage(payload, settings, channelId);
  return { response, action: "posted" };
}

async function resolvedColourRoles(settings = getDiscordSettingsRaw()) {
  const configured = Array.isArray(settings.colourRoles) ? settings.colourRoles : [];
  if (!configured.length) return [];
  return configured
    .map((entry) => {
      const roleId = String(entry.roleId || "").trim();
      return { key: String(entry.key ?? ""), label: String(entry.label ?? entry.roleName ?? ""), roleName: String(entry.roleName ?? entry.label ?? ""), roleId, color: toNumber(entry.color) };
    })
    .filter((entry) => entry.key && entry.label && entry.roleId);
}

function discordColourButtonEmoji(role) {
  const label = String(role?.label ?? "").toLowerCase();
  const color = toNumber(role?.color);
  if (label.includes("green") || color === 0x2be56f || color === 0x1fb72e) return "🟢";
  if (label.includes("blue") || color === 0x5fa8ff || color === 0x244cff) return "🔵";
  if (label.includes("purple") || color === 0x9b4acb) return "🟣";
  if (label.includes("pink") || color === 0xff4f88) return "🌸";
  if (label.includes("red") || color === 0xff2028) return "🔴";
  if (label.includes("yellow") || color === 0xf4c430) return "🟡";
  if (label.includes("orange") || color === 0xff9f1c) return "🟠";
  if (label.includes("black") || color === 0x111111) return "⚫";
  if (label.includes("white") || color === 0xf4f4f4) return "⚪";
  return "🎨";
}
async function postDiscordColourSelector(settings = getDiscordSettingsRaw()) {
  const channelId = String(settings.colourRolesChannelId || settings.channels?.notifications || settings.channelId || "").trim();
  if (!channelId) throw new Error("Choose a colour-role channel before posting the selector.");
  const roles = await resolvedColourRoles(settings);
  if (!roles.length) throw new Error("No colour roles are ready yet. Create/sync colour roles before posting the selector.");
  const components = [];
  for (let index = 0; index < roles.length; index += 5) {
    components.push({
      type: 1,
      components: roles.slice(index, index + 5).map((role) => ({
        type: 2,
        style: 2,
        custom_id: `colourrole:select:${role.key}:${role.roleId}`,
        label: `${discordColourButtonEmoji(role)} ${role.label}`.slice(0, 80),
      })),
    });
  }
  const payload = {
    embeds: [discordCommandEmbed("Choose Your Colour", "Pick one name colour below. Selecting a new colour automatically removes your previous colour role.", [
      { name: "Available colours", value: roles.map((role) => role.label).join(", "), inline: false },
    ], 0xf0c64f)],
    components,
  };
  const { response, action } = await sendOrUpdateDiscordMessage(channelId, settings.colourRolesMessageId, payload, settings);
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const next = normalizeDiscordSettings({ ...stored, colourRolesChannelId: channelId, colourRolesMessageId: String(response?.id ?? settings.colourRolesMessageId ?? "") });
  statements.upsertSetting.run("discord_json", JSON.stringify(next), new Date().toISOString());
  recordDiscordDeliverySafe({ status: "sent", eventType: "colour_role_selector", summary: `${action === "updated" ? "Updated" : "Posted"} colour role selector`, channelId, channelKey: "colourRoles", metadata: { roles, messageId: response?.id, action } });
  return response;
}

async function discordApiRequest(pathname, options = {}, settings = getDiscordSettingsRaw()) {
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  const response = await fetch(`https://discord.com/api/v10${pathname}`, {
    ...options,
    headers: {
      authorization: `Bot ${settings.botToken}`,
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function createDiscordRole(guildId, role, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: role.roleName, color: toNumber(role.color), hoist: false, mentionable: false }),
  }, settings);
}

async function createDiscordRoleFromAdmin(body, settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const roleName = String(body.name ?? body.roleName ?? "").trim();
  if (roleName.length < 1 || roleName.length > 100) throw new Error("Role name must be 1-100 characters");
  const colorInput = String(body.color ?? "").trim();
  const color = colorInput.startsWith("#") ? parseInt(colorInput.slice(1), 16) : toNumber(body.color);
  const response = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/roles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: roleName,
      color: Number.isFinite(color) ? Math.max(0, Math.min(0xffffff, color)) : 0,
      hoist: body.hoist === true,
      mentionable: body.mentionable === true,
    }),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "role_create", summary: `Created Discord role: ${roleName}`, metadata: { roleId: response?.id, roleName, color } });
  return response;
}

async function updateDiscordRoleDefinition(guildId, roleId, role, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: role.roleName, color: toNumber(role.color), hoist: false, mentionable: false }),
  }, settings);
}

async function deleteDiscordRoleDefinition(guildId, roleId, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" }, settings);
}

async function moveDiscordRolesBelow(guildId, roles, anchorPosition, settings = getDiscordSettingsRaw()) {
  if (!roles.length || !anchorPosition) return null;
  const positions = roles.map((role, index) => ({ id: role.roleId, position: Math.max(anchorPosition - 1 - index, 1) }));
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(positions),
  }, settings);
}

async function manageDiscordColourRoles(settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const guildId = String(settings.guildId);
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const discovery = await discordGuildDiscovery(settings);
  const rolesById = new Map((discovery.roles ?? []).map((role) => [String(role.id), role]));
  const mosswickRole = (discovery.roles ?? []).find((role) => String(role.name ?? "").toLowerCase() === "mosswick");
  const targetKeys = new Set((settings.colourRoles ?? []).map((role) => String(role.key)));
  const targetRoleIds = new Set((settings.colourRoles ?? []).map((role) => String(role.roleId ?? "")).filter(Boolean));
  for (const stale of stored.colourRoles ?? []) {
    const staleRoleId = String(stale.roleId ?? "").trim();
    if (!staleRoleId || targetKeys.has(String(stale.key)) || targetRoleIds.has(staleRoleId) || !rolesById.has(staleRoleId)) continue;
    await deleteDiscordRoleDefinition(guildId, staleRoleId, settings).catch((error) => {
      console.warn(`Discord colour role delete failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  const managed = [];
  for (const role of settings.colourRoles ?? []) {
    const configured = { ...role, roleName: String(role.roleName || role.label), label: String(role.label || role.roleName), color: toNumber(role.color) };
    const existing = rolesById.get(String(configured.roleId ?? ""));
    const result = existing
      ? await updateDiscordRoleDefinition(guildId, existing.id, configured, settings)
      : await createDiscordRole(guildId, configured, settings);
    managed.push({ ...configured, roleId: String(result?.id ?? existing?.id ?? configured.roleId), action: existing ? "updated" : "created" });
  }
  if (mosswickRole) await moveDiscordRolesBelow(guildId, managed, toNumber(mosswickRole.position), settings).catch((error) => {
    console.warn(`Discord colour role positioning failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  const next = normalizeDiscordSettings({ ...stored, ...settings, colourRoles: managed.map(({ action, ...role }) => role) });
  statements.upsertSetting.run("discord_json", JSON.stringify(next), new Date().toISOString());
  recordDiscordDeliverySafe({
    status: "sent",
    eventType: "colour_role_manage",
    summary: `Managed ${managed.length.toLocaleString()} colour roles`,
    metadata: { roles: managed, anchorRole: mosswickRole ? { id: mosswickRole.id, name: mosswickRole.name, position: mosswickRole.position } : null },
  });
  return { roles: managed, anchorRole: mosswickRole ?? null };
}

function discordButtonRows(buttons) {
  const rows = [];
  for (let index = 0; index < buttons.length; index += 5) rows.push({ type: 1, components: buttons.slice(index, index + 5) });
  return rows;
}

function rolePanelPayload(panel) {
  const options = (panel.options ?? []).filter((option) => option.roleId);
  const fields = [];
  if (panel.showHelperText !== false) {
    fields.push({ name: panel.mode === "single" ? "Selection" : "Selections", value: panel.mode === "single" ? "Only one role from this panel can be active at once." : "Click again to remove a role.", inline: false });
  }
  const buttons = options.map((option) => ({
    type: 2,
    style: 1,
    custom_id: `rolepanel:${panel.key}:${option.key}`,
    label: `${option.emoji ? `${option.emoji} ` : ""}${option.label}`.slice(0, 80),
  }));
  return {
    embeds: [discordCommandEmbed(panel.title, panel.description || (panel.mode === "single" ? "Choose one role below." : "Choose any roles below."), fields, 0x5865f2)],
    components: discordButtonRows(buttons),
  };
}

function updateStoredDiscordPanel(panel) {
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const panels = stored.rolePanels.map((entry) => entry.key === panel.key ? normalizeDiscordRolePanel(panel, entry) : entry);
  statements.upsertSetting.run("discord_json", JSON.stringify(normalizeDiscordSettings({ ...stored, rolePanels: panels })), new Date().toISOString());
}

async function postDiscordRolePanel(panelKey, settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  const panel = settings.rolePanels.find((entry) => entry.key === panelKey);
  if (!panel) throw new Error("Role panel not found");
  const channelId = String(panel.channelId || settings.channelId || "").trim();
  if (!channelId) throw new Error(`Choose a channel for ${panel.label} before posting.`);
  const payload = rolePanelPayload(panel);
  if (!payload.components.length) throw new Error(`${panel.label} needs at least one option with a role.`);
  const { response, action } = await sendOrUpdateDiscordMessage(channelId, panel.messageId, payload, settings);
  const nextPanel = { ...panel, channelId, messageId: String(response?.id ?? panel.messageId ?? "") };
  updateStoredDiscordPanel(nextPanel);
  recordDiscordDeliverySafe({ status: "sent", eventType: "role_panel", summary: `${action === "updated" ? "Updated" : "Posted"} ${panel.label}`, channelId, channelKey: "rolePanel", metadata: { panel: nextPanel, action } });
  return { panel: nextPanel, response, action };
}

async function postDiscordWelcomeFlow(settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  const flow = settings.welcomeFlow;
  const channelId = String(flow.channelId || settings.channelId || "").trim();
  if (!channelId) throw new Error("Choose a welcome channel before posting.");
  const fields = flow.showNextStep === false ? [] : [
    { name: "Next step", value: flow.readyRoleId ? "Click Ready when you have read the welcome steps." : "Configure a Ready role if you want the button to assign access.", inline: false },
  ];
  const payload = {
    embeds: [discordCommandEmbed(flow.title, flow.message, fields, 0xf0c64f)],
    components: discordButtonRows([{ type: 2, style: 3, custom_id: "welcome:ready", label: "Ready" }]),
  };
  const { response, action } = await sendOrUpdateDiscordMessage(channelId, flow.messageId, payload, settings);
  const stored = normalizeDiscordSettings(safeJson(statements.getSetting.get("discord_json")?.value, defaultDiscordSettings));
  const welcomeFlow = normalizeDiscordWelcomeFlow({ ...flow, channelId, messageId: String(response?.id ?? flow.messageId ?? "") });
  statements.upsertSetting.run("discord_json", JSON.stringify(normalizeDiscordSettings({ ...stored, welcomeFlow })), new Date().toISOString());
  recordDiscordDeliverySafe({ status: "sent", eventType: "welcome_flow", summary: `${action === "updated" ? "Updated" : "Posted"} welcome flow`, channelId, channelKey: "welcome", metadata: { welcomeFlow, action } });
  return { welcomeFlow, response, action };
}

async function addDiscordMemberRole(guildId, userId, roleId, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, { method: "PUT" }, settings);
}

async function removeDiscordMemberRole(guildId, userId, roleId, settings = getDiscordSettingsRaw()) {
  return discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, { method: "DELETE" }, settings);
}

async function getDiscordMemberRoleSet(guildId, userId, settings = getDiscordSettingsRaw(), fallbackRoles = []) {
  try {
    const member = await discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(userId)}`, {}, settings);
    return new Set(Array.isArray(member?.roles) ? member.roles.map(String) : []);
  } catch {
    return new Set(Array.isArray(fallbackRoles) ? fallbackRoles.map(String) : []);
  }
}

async function discordGuildDiscovery(settings = getDiscordSettingsRaw()) {
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const guildId = String(settings.guildId);
  const botUser = await discordApiRequest("/users/@me", {}, settings);
  const botUserId = String(botUser?.id ?? "");
  const [guild, channels, roles, botMember] = await Promise.all([
    discordApiRequest(`/guilds/${encodeURIComponent(guildId)}`, {}, settings),
    discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/channels`, {}, settings),
    discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/roles`, {}, settings),
    botUserId ? discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members/${encodeURIComponent(botUserId)}`, {}, settings).catch(() => null) : null,
  ]);
  const sortedChannels = (Array.isArray(channels) ? channels : [])
    .filter((channel) => [0, 5, 10, 11, 12, 15].includes(Number(channel.type)))
    .sort((a, b) => String(a.parent_id ?? "").localeCompare(String(b.parent_id ?? "")) || toNumber(a.position) - toNumber(b.position) || String(a.name).localeCompare(String(b.name)))
    .map((channel) => ({
      id: String(channel.id),
      name: String(channel.name ?? channel.id),
      type: toNumber(channel.type),
      parentId: channel.parent_id ? String(channel.parent_id) : "",
      label: `#${String(channel.name ?? channel.id)}`,
      permissionOverwrites: Array.isArray(channel.permission_overwrites) ? channel.permission_overwrites : [],
    }));
  const botRoleIds = new Set(Array.isArray(botMember?.roles) ? botMember.roles.map(String) : []);
  const botHighestRolePosition = (Array.isArray(roles) ? roles : [])
    .filter((role) => botRoleIds.has(String(role.id)))
    .reduce((highest, role) => Math.max(highest, toNumber(role.position)), 0);
  const memberRoleCounts = new Map();
  const members = [];
  let memberCountAvailable = true;
  let memberCountError = "";
  let after = "0";
  for (let page = 0; page < 10; page += 1) {
    let batch = [];
    try {
      batch = await discordApiRequest(`/guilds/${encodeURIComponent(guildId)}/members?limit=1000&after=${encodeURIComponent(after)}`, {}, settings);
    } catch (error) {
      memberCountAvailable = false;
      memberCountError = error?.message ? String(error.message) : "Discord member list could not be fetched";
      break;
    }
    if (!Array.isArray(batch) || !batch.length) break;
    for (const member of batch) {
      const userId = String(member.user?.id ?? "");
      if (!userId) continue;
      after = userId;
      const roleIds = Array.isArray(member.roles) ? member.roles.map(String) : [];
      for (const roleId of roleIds) memberRoleCounts.set(roleId, (memberRoleCounts.get(roleId) ?? 0) + 1);
      members.push({
        id: userId,
        username: String(member.user?.global_name ?? member.nick ?? member.user?.username ?? userId),
        roles: roleIds,
      });
    }
    if (batch.length < 1000) break;
  }
  const normalizedRoles = (Array.isArray(roles) ? roles : [])
    .filter((role) => String(role.id) !== guildId)
    .sort((a, b) => toNumber(b.position) - toNumber(a.position) || String(a.name).localeCompare(String(b.name)))
    .map((role) => {
      const roleId = String(role.id);
      const position = toNumber(role.position);
      const managed = Boolean(role.managed);
      const botCanManage = Boolean(botHighestRolePosition && position < botHighestRolePosition && !managed);
      return {
        id: roleId,
        name: String(role.name ?? roleId),
        color: toNumber(role.color),
        position,
        managed,
        mentionable: Boolean(role.mentionable),
        memberCount: memberCountAvailable ? memberRoleCounts.get(roleId) ?? 0 : null,
        memberCountAvailable,
        botCanManage,
        manageabilityReason: botCanManage ? "Bot can manage" : managed ? "Managed by integration" : botHighestRolePosition ? "Move bot role above this role" : "Bot role not found",
      };
    });
  return {
    guild: { id: guildId, name: String(guild?.name ?? guildId) },
    bot: { id: botUserId, username: String(botUser?.username ?? "Bot"), highestRolePosition: botHighestRolePosition },
    channels: sortedChannels,
    roles: normalizedRoles,
    members: members.slice(0, 1000),
    memberCount: memberCountAvailable ? members.length : null,
    memberCountAvailable,
    memberCountError,
    fetchedAt: new Date().toISOString(),
  };
}

async function discordAuditLogReport(settings = getDiscordSettingsRaw()) {
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const payload = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/audit-logs?limit=25`, {}, settings);
  return {
    entries: (payload.audit_log_entries ?? []).map((entry) => ({
      id: String(entry.id),
      actionType: entry.action_type,
      userId: String(entry.user_id ?? ""),
      targetId: String(entry.target_id ?? ""),
      reason: String(entry.reason ?? ""),
      changes: entry.changes ?? [],
    })),
    users: payload.users ?? [],
  };
}

async function discordRoleCleanupReport(settings = getDiscordSettingsRaw()) {
  const discovery = await discordGuildDiscovery(settings);
  const configuredRoleIds = new Set([
    ...Object.values(settings.craftRoles ?? {}),
    ...(settings.colourRoles ?? []).map((role) => role.roleId),
    ...(settings.rolePanels ?? []).flatMap((panel) => (panel.options ?? []).map((option) => option.roleId)),
    settings.welcomeFlow?.readyRoleId,
  ].map(String).filter(Boolean));
  const roles = discovery.roles ?? [];
  const colorGroups = new Map();
  for (const role of roles) {
    if (role.color) colorGroups.set(String(role.color), [...(colorGroups.get(String(role.color)) ?? []), role]);
  }
  return {
    unusedRoles: roles.filter((role) => role.memberCountAvailable !== false && !role.managed && !configuredRoleIds.has(String(role.id)) && toNumber(role.memberCount) === 0).slice(0, 80),
    duplicateColours: [...colorGroups.values()].filter((group) => group.length > 1).map((group) => ({ color: group[0].color, roles: group.map((role) => ({ id: role.id, name: role.name, memberCount: role.memberCount })) })),
    missingConfiguredRoles: [...configuredRoleIds].filter((roleId) => !roles.some((role) => String(role.id) === roleId)),
    notManageableConfiguredRoles: roles.filter((role) => configuredRoleIds.has(String(role.id)) && !role.botCanManage),
  };
}

async function discordChannelPermissionReport(settings = getDiscordSettingsRaw()) {
  const discovery = await discordGuildDiscovery(settings);
  const channels = discovery.channels ?? [];
  const configuredRoles = new Set([
    ...Object.values(settings.craftRoles ?? {}),
    ...(settings.rolePanels ?? []).flatMap((panel) => (panel.options ?? []).map((option) => option.roleId)),
    settings.welcomeFlow?.readyRoleId,
  ].map(String).filter(Boolean));
  return {
    channels: Object.entries(settings.channels ?? {}).filter(([, id]) => id).map(([key, id]) => {
      const channel = channels.find((entry) => String(entry.id) === String(id));
      const roleOverwrites = (channel?.permissionOverwrites ?? []).filter((overwrite) => configuredRoles.has(String(overwrite.id)));
      return {
        key,
        id: String(id),
        name: channel?.label ?? `Unknown channel (${id})`,
        found: Boolean(channel),
        configuredRoleOverwrites: roleOverwrites.length,
        deniedConfiguredRoles: roleOverwrites.filter((overwrite) => BigInt(overwrite.deny ?? 0) > 0n).map((overwrite) => String(overwrite.id)),
      };
    }),
  };
}

async function discordInactiveMemberReport(days = 30, settings = getDiscordSettingsRaw()) {
  const discovery = await discordGuildDiscovery(settings);
  const cutoffMs = Date.now() - Math.max(toNumber(days) || 30, 1) * 24 * 60 * 60 * 1000;
  const activeUserIds = new Set();
  let reactionChecks = 0;
  const textChannels = (discovery.channels ?? []).filter((channel) => [0, 5].includes(toNumber(channel.type))).slice(0, 30);
  for (const channel of textChannels) {
    const messages = await discordApiRequest(`/channels/${encodeURIComponent(channel.id)}/messages?limit=100`, {}, settings).catch(() => []);
    if (!Array.isArray(messages)) continue;
    for (const message of messages) {
      if (Date.parse(message.timestamp ?? "") < cutoffMs) continue;
      if (message.author?.id) activeUserIds.add(String(message.author.id));
      for (const reaction of Array.isArray(message.reactions) ? message.reactions.slice(0, 5) : []) {
        if (reactionChecks >= 150) break;
        const emoji = reaction.emoji?.id ? `${reaction.emoji.name}:${reaction.emoji.id}` : reaction.emoji?.name;
        if (!emoji) continue;
        reactionChecks += 1;
        const users = await discordApiRequest(`/channels/${encodeURIComponent(channel.id)}/messages/${encodeURIComponent(message.id)}/reactions/${encodeURIComponent(emoji)}?limit=100`, {}, settings).catch(() => []);
        if (Array.isArray(users)) users.forEach((user) => user?.id ? activeUserIds.add(String(user.id)) : null);
      }
    }
  }
  const inactive = (discovery.members ?? []).filter((member) => !activeUserIds.has(String(member.id)));
  return { days: Math.max(toNumber(days) || 30, 1), scannedChannels: textChannels.length, reactionChecks, activeCount: activeUserIds.size, inactive: inactive.slice(0, 100), totalMembers: discovery.memberCount };
}

async function sendDiscordAnnouncement(body, settings = getDiscordSettingsRaw()) {
  const channelId = String(body.channelId ?? settings.channelId ?? "").trim();
  const title = String(body.title ?? "Announcement").trim() || "Announcement";
  const message = String(body.message ?? "").trim();
  if (!channelId || !message) throw new Error("Announcement needs a channel and message.");
  const response = await sendDiscordMessage({ embeds: [discordCommandEmbed(title, message, [], 0xf0c64f)] }, settings, channelId);
  recordDiscordDeliverySafe({ status: "sent", eventType: "announcement", channelId, channelKey: "announcement", summary: title, response: { id: response?.id, channel_id: response?.channel_id } });
  return response;
}

async function updateDiscordPinnedInfo(body, settings = getDiscordSettingsRaw()) {
  const channelId = String(body.channelId ?? "").trim();
  const title = String(body.title ?? "Information").trim() || "Information";
  const message = String(body.message ?? "").trim();
  const messageId = String(body.messageId ?? "").trim();
  if (!channelId || !message) throw new Error("Pinned info needs a channel and message.");
  const { response, action } = await sendOrUpdateDiscordMessage(channelId, messageId, { embeds: [discordCommandEmbed(title, message, [], 0x5865f2)] }, settings);
  if (response?.id) await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/pins/${encodeURIComponent(response.id)}`, { method: "PUT" }, settings).catch(() => null);
  recordDiscordDeliverySafe({ status: "sent", eventType: "pinned_info", channelId, channelKey: "pinnedInfo", summary: `${action === "updated" ? "Updated" : "Posted"} pinned info`, response: { id: response?.id, channel_id: response?.channel_id } });
  return { response, action };
}

async function createDiscordScheduledEvent(body, settings = getDiscordSettingsRaw()) {
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const startTime = new Date(String(body.startTime ?? ""));
  const endTime = new Date(String(body.endTime ?? ""));
  const location = String(body.location ?? "Discord").trim() || "Discord";
  if (!name || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) throw new Error("Event needs a name, start time and end time.");
  const response = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/scheduled-events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, description, privacy_level: 2, entity_type: 3, scheduled_start_time: startTime.toISOString(), scheduled_end_time: endTime.toISOString(), entity_metadata: { location } }),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "scheduled_event", summary: name, metadata: { eventId: response?.id, startTime: startTime.toISOString(), endTime: endTime.toISOString() } });
  return response;
}

function discordAuditReason(reason, fallback) {
  const value = String(reason ?? fallback ?? "Timbersteel Trade moderation action").trim().slice(0, 512);
  return value ? { "X-Audit-Log-Reason": encodeURIComponent(value) } : {};
}

function requireDiscordModerationSettings(settings = getDiscordSettingsRaw()) {
  settings = normalizeDiscordSettings(settings);
  if (!settings.botToken) throw new Error("Discord bot token is not configured");
  if (!settings.guildId) throw new Error("Discord guild/server ID is not configured");
  return settings;
}

function snowflakeTimestampMs(id) {
  try {
    const raw = String(id ?? "");
    if (!/^\d+$/.test(raw)) return 0;
    return Number((BigInt(raw) >> 22n) + 1420070400000n);
  } catch {
    return 0;
  }
}

async function discordModerationTimeout(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a Discord member to timeout.");
  const minutes = Math.max(0, Math.min(toNumber(body.minutes) || 0, 40320));
  const until = minutes ? new Date(Date.now() + minutes * 60 * 1000).toISOString() : null;
  const response = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, until ? `Timed out member for ${minutes} minutes` : "Removed member timeout") },
    body: JSON.stringify({ communication_disabled_until: until }),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: until ? "moderation_timeout" : "moderation_timeout_clear", summary: until ? `Timed out ${userId} for ${minutes} minutes` : `Removed timeout from ${userId}`, metadata: { userId, minutes, until } });
  return { ok: true, action: until ? "timeout" : "timeout_removed", userId, minutes, until, response };
}

async function discordModerationKick(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a Discord member to kick.");
  await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: discordAuditReason(body.reason, "Kicked member from server"),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_kick", summary: `Kicked ${userId}`, metadata: { userId } });
  return { ok: true, action: "kick", userId };
}

async function discordModerationBan(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a Discord member to ban.");
  const deleteMessageSeconds = Math.max(0, Math.min(toNumber(body.deleteMessageSeconds) || 0, 604800));
  await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/bans/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, "Banned member from server") },
    body: JSON.stringify({ delete_message_seconds: deleteMessageSeconds }),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_ban", summary: `Banned ${userId}`, metadata: { userId, deleteMessageSeconds } });
  return { ok: true, action: "ban", userId, deleteMessageSeconds };
}

async function discordModerationUnban(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Enter a Discord user ID to unban.");
  await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/bans/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: discordAuditReason(body.reason, "Removed server ban"),
  }, settings);
  recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_unban", summary: `Unbanned ${userId}`, metadata: { userId } });
  return { ok: true, action: "unban", userId };
}

async function discordModerationPurge(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? "").trim();
  if (!/^\d+$/.test(channelId)) throw new Error("Choose a Discord channel to clean up.");
  const limit = Math.max(1, Math.min(toNumber(body.limit) || 25, 100));
  const messages = await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/messages?limit=${limit}`, {}, settings);
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const ids = (Array.isArray(messages) ? messages : [])
    .filter((message) => snowflakeTimestampMs(message?.id) > cutoff)
    .map((message) => String(message.id))
    .filter(Boolean)
    .slice(0, limit);
  if (ids.length >= 2) {
    await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/messages/bulk-delete`, {
      method: "POST",
      headers: { "content-type": "application/json", ...discordAuditReason(body.reason, `Purged ${ids.length} channel messages`) },
      body: JSON.stringify({ messages: ids }),
    }, settings);
  } else if (ids.length === 1) {
    await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(ids[0])}`, {
      method: "DELETE",
      headers: discordAuditReason(body.reason, "Deleted channel message"),
    }, settings);
  }
  recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_purge", summary: `Purged ${ids.length} messages`, channelId, metadata: { channelId, requested: limit, deleted: ids.length } });
  return { ok: true, action: "purge", channelId, requested: limit, deleted: ids.length, skippedOlderThan14Days: limit - ids.length };
}

async function discordModerationBans(settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const bans = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/bans?limit=100`, {}, settings);
  return {
    bans: (Array.isArray(bans) ? bans : []).map((entry) => ({
      reason: String(entry.reason ?? ""),
      user: {
        id: String(entry.user?.id ?? ""),
        username: String(entry.user?.global_name ?? entry.user?.username ?? entry.user?.id ?? "Unknown user"),
        avatar: entry.user?.avatar ?? null,
      },
    })),
  };
}

function recordDiscordCase(caseType, details = {}, settings = getDiscordSettingsRaw()) {
  const at = new Date().toISOString();
  statements.insertDiscordModCase.run(
    String(settings.guildId ?? ""),
    String(caseType),
    String(details.userId ?? ""),
    String(details.moderator ?? "dashboard"),
    String(details.reason ?? ""),
    JSON.stringify(details),
    at,
  );
  return { caseId: db.prepare("SELECT last_insert_rowid() AS id").get()?.id, occurredAt: at };
}

function discordCaseLog(limit = 80, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  return {
    cases: statements.recentDiscordModCases.all(settings.guildId, Math.max(1, Math.min(toNumber(limit) || 80, 200))).map((row) => ({ ...row, details: safeJson(row.details_json, {}) })),
  };
}

async function discordWarningCreate(body, moderator = "dashboard", settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  if (!/^\d+$/.test(userId) || !reason) throw new Error("Warning needs a member and reason.");
  const at = new Date().toISOString();
  statements.insertDiscordWarning.run(settings.guildId, userId, moderator, reason, at);
  const modCase = recordDiscordCase("warning", { userId, moderator, reason }, settings);
  const warningId = db.prepare("SELECT last_insert_rowid() AS id").get()?.id;
  const deliveries = [];
  const warningEmbed = discordCommandEmbed("Discord Warning", `You have received a warning in Timbersteel Trade.`, [
    { name: "Reason", value: reason.slice(0, 1024), inline: false },
    { name: "Moderator", value: moderator, inline: true },
  ], 0xef6461);
  try {
    const response = await sendDiscordDirectMessage(userId, { embeds: [warningEmbed] }, settings);
    deliveries.push({ target: "member_dm", status: "sent", messageId: response?.id, channelId: response?.channel_id });
    recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_warning_dm", summary: `Warning DM sent to ${userId}`, channelId: response?.channel_id, metadata: { userId, moderator, reason, warningId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deliveries.push({ target: "member_dm", status: "failed", error: message });
    recordDiscordDeliverySafe({ status: "failed", eventType: "moderation_warning_dm", summary: `Warning DM failed for ${userId}`, error: message, metadata: { userId, moderator, reason, warningId } });
  }
  const logChannelId = String(settings.channels?.modLog || settings.channels?.modNotes || settings.channelId || "").trim();
  if (logChannelId) {
    try {
      const response = await sendDiscordMessage({ embeds: [discordCommandEmbed("Warning Recorded", `<@${userId}> received a warning.`, [
        { name: "Reason", value: reason.slice(0, 1024), inline: false },
        { name: "Moderator", value: moderator, inline: true },
        { name: "Case", value: String(modCase.caseId ?? warningId ?? "Recorded"), inline: true },
      ], 0xef6461)] }, settings, logChannelId);
      deliveries.push({ target: "mod_log", status: "sent", messageId: response?.id, channelId: response?.channel_id });
      recordDiscordDeliverySafe({ status: "sent", eventType: "moderation_warning_log", summary: `Warning logged for ${userId}`, channelId: logChannelId, channelKey: settings.channels?.modLog ? "modLog" : "modNotes", metadata: { userId, moderator, reason, warningId, caseId: modCase.caseId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deliveries.push({ target: "mod_log", status: "failed", error: message });
      recordDiscordDeliverySafe({ status: "failed", eventType: "moderation_warning_log", summary: `Warning log failed for ${userId}`, channelId: logChannelId, channelKey: settings.channels?.modLog ? "modLog" : "modNotes", error: message, metadata: { userId, moderator, reason, warningId, caseId: modCase.caseId } });
    }
  }
  return { ok: true, warningId, deliveries, ...modCase };
}

function discordWarnings(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a member to view warnings.");
  return { warnings: statements.listDiscordWarnings.all(settings.guildId, userId) };
}

function discordWarningsClear(body, moderator = "dashboard", settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a member to clear warnings.");
  const cleared = statements.clearDiscordWarnings.run(settings.guildId, userId).changes;
  const modCase = recordDiscordCase("warnings_cleared", { userId, moderator, reason: body.reason ?? "", cleared }, settings);
  return { ok: true, cleared, ...modCase };
}

function discordModNoteCreate(body, moderator = "dashboard", settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  const note = String(body.note ?? "").trim();
  if (!/^\d+$/.test(userId) || !note) throw new Error("Mod note needs a member and note.");
  statements.insertDiscordModNote.run(settings.guildId, userId, moderator, note, new Date().toISOString());
  return { ok: true, noteId: db.prepare("SELECT last_insert_rowid() AS id").get()?.id };
}

function discordModNotes(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a member to view mod notes.");
  return { notes: statements.listDiscordModNotes.all(settings.guildId, userId) };
}

async function discordSlowmode(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? "").trim();
  const seconds = Math.max(0, Math.min(toNumber(body.seconds) || 0, 21600));
  if (!/^\d+$/.test(channelId)) throw new Error("Choose a channel for slowmode.");
  const response = await discordApiRequest(`/channels/${encodeURIComponent(channelId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, `Set slowmode to ${seconds} seconds`) },
    body: JSON.stringify({ rate_limit_per_user: seconds }),
  }, settings);
  recordDiscordCase("slowmode", { channelId, seconds, reason: body.reason ?? "" }, settings);
  return { ok: true, channelId, seconds, response };
}

async function discordLockdown(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? "").trim();
  const locked = body.locked !== false;
  if (!/^\d+$/.test(channelId)) throw new Error("Choose a channel for lockdown.");
  const sendMessagesBit = "2048";
  const payload = locked
    ? { type: 0, allow: "0", deny: sendMessagesBit }
    : { type: 0, allow: sendMessagesBit, deny: "0" };
  await discordApiRequest(`/channels/${encodeURIComponent(channelId)}/permissions/${encodeURIComponent(settings.guildId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, locked ? "Locked channel" : "Unlocked channel") },
    body: JSON.stringify(payload),
  }, settings);
  recordDiscordCase(locked ? "lockdown" : "unlock", { channelId, reason: body.reason ?? "" }, settings);
  return { ok: true, channelId, locked };
}

async function discordTemporaryBan(body, settings = getDiscordSettingsRaw()) {
  const result = await discordModerationBan(body, settings);
  const hours = Math.max(1, Math.min(toNumber(body.hours) || 24, 24 * 365));
  const unbanAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  statements.upsertDiscordTempBan.run(settings.guildId, result.userId, unbanAt, String(body.reason ?? ""), new Date().toISOString());
  recordDiscordCase("temporary_ban", { userId: result.userId, hours, unbanAt, reason: body.reason ?? "" }, settings);
  return { ...result, action: "temporary_ban", hours, unbanAt };
}

async function processDiscordTempBans() {
  const settings = getDiscordSettingsRaw();
  if (!settings.botToken || !settings.guildId) return;
  for (const row of statements.dueDiscordTempBans.all(new Date().toISOString())) {
    try {
      await discordModerationUnban({ userId: row.user_id, reason: `Temporary ban expired: ${row.reason ?? ""}` }, settings);
      statements.deleteDiscordTempBan.run(row.guild_id, row.user_id);
    } catch (error) {
      recordDiscordDeliverySafe({ status: "failed", eventType: "temp_ban_unban", summary: `Temporary unban failed for ${row.user_id}`, error: error instanceof Error ? error.message : String(error), metadata: row });
    }
  }
}

async function syncDiscordAutoModeration(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const keywords = String(body.blockedWords ?? "").split(/[\n,]/).map((word) => word.trim()).filter(Boolean).slice(0, 100);
  if (!keywords.length) throw new Error("Add at least one blocked word or phrase.");
  const name = String(body.name ?? "Timbersteel keyword filter").trim() || "Timbersteel keyword filter";
  const alertChannelId = String(settings.channels?.modLog || settings.channels?.modNotes || settings.channelId || "").trim();
  const actions = [
    { type: 1, metadata: { custom_message: "That message was blocked by Timbersteel Trade AutoMod." } },
    ...(/^\d+$/.test(alertChannelId) ? [{ type: 2, metadata: { channel_id: alertChannelId } }] : []),
  ];
  const response = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/auto-moderation/rules`, {
    method: "POST",
    headers: { "content-type": "application/json", ...discordAuditReason(body.reason, "Created bot-managed auto moderation rule") },
    body: JSON.stringify({
      name,
      event_type: 1,
      trigger_type: 1,
      trigger_metadata: { keyword_filter: keywords },
      actions,
      enabled: body.enabled !== false,
    }),
  }, settings);
  recordDiscordCase("automod_rule", { ruleId: response?.id, name, keywords: keywords.length, alertChannelId }, settings);
  return { ok: true, rule: response, alertChannelId: /^\d+$/.test(alertChannelId) ? alertChannelId : null };
}

async function discordNativeAutoModerationRules(settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const rules = await discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/auto-moderation/rules`, {}, settings);
  return { rules: Array.isArray(rules) ? rules : [] };
}

function normalizeCommandName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-").slice(0, 32);
}

function discordCustomCommands() {
  return { commands: statements.listDiscordCustomCommands.all() };
}

function upsertDiscordCustomCommand(body) {
  const name = normalizeCommandName(body.name);
  const description = String(body.description ?? "Custom Timbersteel command").trim().slice(0, 100) || "Custom Timbersteel command";
  const response = String(body.response ?? "").trim();
  if (!/^[a-z0-9_-]{1,32}$/.test(name) || !response) throw new Error("Custom command needs a valid name and response.");
  statements.upsertDiscordCustomCommand.run(name, description, response, new Date().toISOString());
  return { ok: true, command: { name, description, response } };
}

async function postDiscordPoll(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? settings.channelId ?? "").trim();
  const title = String(body.title ?? "Poll").trim() || "Poll";
  const options = String(body.options ?? "").split(/\n|,/).map((entry) => entry.trim()).filter(Boolean).slice(0, 10);
  if (!channelId || options.length < 2) throw new Error("Poll needs a channel and at least two options.");
  const optionMeta = options.map((label, index) => ({ key: String(index), label }));
  const components = [];
  for (let i = 0; i < options.length; i += 5) {
    components.push({ type: 1, components: options.slice(i, i + 5).map((label, offset) => ({ type: 2, style: 2, label: label.slice(0, 80), custom_id: `poll:${i + offset}:${encodeURIComponent(label).slice(0, 60)}` })) });
  }
  const response = await sendDiscordMessage({ embeds: [discordCommandEmbed(title, "Vote using the buttons below.", options.map((option, index) => ({ name: `${index + 1}. ${option}`, value: "0 votes", inline: true })), 0x5865f2)], components }, settings, channelId);
  if (response?.id) statements.upsertDiscordComponentMessage.run(response.id, "poll", JSON.stringify({ title, description: "Vote using the buttons below.", color: 0x5865f2, options: optionMeta }), new Date().toISOString());
  recordDiscordCase("poll_posted", { channelId, messageId: response?.id, title, options }, settings);
  return { ok: true, response };
}

async function postDiscordRsvp(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? settings.channelId ?? "").trim();
  const title = String(body.title ?? "Event RSVP").trim() || "Event RSVP";
  const description = String(body.description ?? "").trim() || "Choose your RSVP below.";
  if (!channelId) throw new Error("RSVP needs a channel.");
  const response = await sendDiscordMessage({
    embeds: [discordCommandEmbed(title, description, [
      { name: "Going", value: "0", inline: true },
      { name: "Maybe", value: "0", inline: true },
      { name: "Not Going", value: "0", inline: true },
    ], 0x4ee28a)],
    components: [{ type: 1, components: [
      { type: 2, style: 3, label: "Going", custom_id: "rsvp:going" },
      { type: 2, style: 2, label: "Maybe", custom_id: "rsvp:maybe" },
      { type: 2, style: 4, label: "Not Going", custom_id: "rsvp:not-going" },
    ] }],
  }, settings, channelId);
  if (response?.id) statements.upsertDiscordComponentMessage.run(response.id, "rsvp", JSON.stringify({ title, description, color: 0x4ee28a, options: [
    { key: "going", label: "Going" },
    { key: "maybe", label: "Maybe" },
    { key: "not-going", label: "Not Going" },
  ] }), new Date().toISOString());
  recordDiscordCase("rsvp_posted", { channelId, messageId: response?.id, title }, settings);
  return { ok: true, response };
}

async function sendDiscordCleanEmbed(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const channelId = String(body.channelId ?? settings.channelId ?? "").trim();
  const title = String(body.title ?? "Message").trim() || "Message";
  const description = String(body.description ?? "").trim();
  const color = String(body.color ?? "").startsWith("#") ? parseInt(String(body.color).slice(1), 16) : 0xf0c64f;
  if (!channelId || !description) throw new Error("Embed needs a channel and message.");
  const response = await sendDiscordMessage({ embeds: [discordCommandEmbed(title, description, [], Number.isFinite(color) ? color : 0xf0c64f)] }, settings, channelId);
  recordDiscordCase("embed_posted", { channelId, messageId: response?.id, title }, settings);
  return { ok: true, response };
}

async function discordMemberProfile(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const userId = String(body.userId ?? "").trim();
  if (!/^\d+$/.test(userId)) throw new Error("Choose a member.");
  const [member, warnings, notes] = await Promise.all([
    discordApiRequest(`/guilds/${encodeURIComponent(settings.guildId)}/members/${encodeURIComponent(userId)}`, {}, settings),
    Promise.resolve(statements.listDiscordWarnings.all(settings.guildId, userId)),
    Promise.resolve(statements.listDiscordModNotes.all(settings.guildId, userId)),
  ]);
  return { member, warnings, notes };
}

async function discordNicknameReport(body, settings = getDiscordSettingsRaw()) {
  settings = requireDiscordModerationSettings(settings);
  const pattern = String(body.pattern ?? "").trim();
  if (!pattern) throw new Error("Enter a nickname pattern.");
  const regex = new RegExp(pattern, "i");
  const discovery = await discordGuildDiscovery(settings);
  return { pattern, mismatches: (discovery.members ?? []).filter((member) => !regex.test(String(member.username ?? ""))).slice(0, 100) };
}

const discordTestEvents = {
  listing: {
    eventType: "market_new_listing",
    summary: "New listing: Rough Plank x240 at 6g",
    metadata: { itemName: "Rough Plank", owner: "Modular", quantity: 240, price: 6, totalValue: 1440 },
  },
  sale: {
    eventType: "market_sale_confirmed",
    summary: "Confirmed sale: Bronze Ingot x75 at 18g",
    metadata: { itemName: "Bronze Ingot", owner: "Mosswick", quantity: 75, price: 18, totalValue: 1350 },
  },
  craftStarted: {
    eventType: "production_started",
    summary: "Craft started: Tier 4 Scholar Workstation",
    metadata: { label: "Tier 4 Scholar Workstation", tier: 4, buildingName: "Scholar Hall", crafterName: "Modular", skillName: "Scholar", professionKey: "scholar", totalXp: 82000, progressPct: 7.5 },
  },
  craftCompleted: {
    eventType: "production_completed",
    summary: "Craft completed: Refined Rough Plank",
    metadata: { label: "Refined Rough Plank", tier: 3, buildingName: "Carpentry Workshop", crafterName: "Modular", skillName: "Carpentry", professionKey: "carpentry", totalXp: 64000, progressPct: 100 },
  },
  supplies: {
    eventType: "supplies",
    summary: "Supply stock changed: 11,946 remaining",
    metadata: { runwayDays: 6.8, runway: "6 days 19 hours", upkeep: "448.5 supplies per day", runsOutAt: new Date(Date.now() + 6.8 * 24 * 60 * 60 * 1000).toISOString() },
  },
  appUpdate: {
    eventType: "app_update",
    summary: `Version ${appVersion} is live with the latest changes`,
    metadata: { version: appVersion, releaseKey: currentAppReleaseKey(), changelogUrl },
  },
};

async function currentAppUpdateDetails() {
  const reduceNotes = (notes, maxLength = 900) => {
    const reduced = [];
    let total = 0;
    for (const note of notes) {
      const line = `- ${note}`;
      if (total + line.length + (reduced.length ? 1 : 0) > maxLength) break;
      reduced.push(line);
      total += line.length + (reduced.length > 1 ? 1 : 0);
    }
    if (reduced.length < notes.length) reduced.push(`- Plus ${notes.length - reduced.length} more change${notes.length - reduced.length === 1 ? "" : "s"} in the changelog.`);
    return reduced.join("\n");
  };
  try {
    const changelog = await readFile(changelogPath, "utf8");
    const escapedVersion = appVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = changelog.match(new RegExp(`## \\[?${escapedVersion}\\]?[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`));
    const section = match?.[1] ?? "";
    const notes = section
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim())
      .filter(Boolean)
      .slice(0, 12);
    if (notes.length) {
      return {
        summary: `Version ${appVersion} is live: ${notes[0].replace(/\.$/, "")}.`,
        changeNotes: reduceNotes(notes),
      };
    }
  } catch (error) {
    console.warn(`Unable to read changelog for Discord app update: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    summary: `Version ${appVersion} is live with the latest fixes and improvements.`,
    changeNotes: "- See the changelog for the full list of changes.",
  };
}

async function sendDiscordTestNotification(kind = "basic") {
  const settings = getDiscordSettingsRaw();
  if (kind === "basic") {
    const summary = "Discord integration test from Timbersteel Trade.";
    try {
      const response = await sendDiscordMessage({
        content: summary,
        allowed_mentions: { parse: [] },
      }, settings, settings.channelId);
      recordDiscordDeliverySafe({ status: "sent", eventType: "test_basic", channelId: settings.channelId, channelKey: "notifications", summary, metadata: discordDiagnosticContext("test_basic", {}, settings), response: { id: response?.id, channel_id: response?.channel_id } });
      return response;
    } catch (error) {
      recordDiscordDeliverySafe({ status: "failed", eventType: "test_basic", channelId: settings.channelId, channelKey: "notifications", summary, error: error instanceof Error ? error.message : String(error), metadata: discordDiagnosticContext("test_basic", {}, settings) });
      throw error;
    }
  }
  const sample = discordTestEvents[kind];
  if (!sample) throw new Error("Unknown Discord test notification");
  const updateDetails = sample.eventType === "app_update" ? await currentAppUpdateDetails() : null;
  const summary = updateDetails?.summary ?? sample.summary;
  const metadata = updateDetails ? { ...sample.metadata, changeNotes: updateDetails.changeNotes } : sample.metadata;
  return sendDiscordActivity(sample.eventType, summary, new Date().toISOString(), metadata, settings);
}

async function announceDiscordAppUpdateIfNeeded({ recordAlreadyAnnounced = true } = {}) {
  const settings = getDiscordSettingsRaw();
  const releaseKey = currentAppReleaseKey();
  const announcementKey = currentAppAnnouncementKey();
  if (!settings.enabled || !settings.botToken || !settings.notify.appUpdates) {
    recordDiscordDeliverySafe({ status: "skipped", eventType: "app_update", summary: `Version ${appVersion} is now live.`, reason: "Discord disabled, bot token missing, or app update notifications disabled", metadata: discordDiagnosticContext("app_update", { version: appVersion, releaseKey, announcementKey, changelogUrl }, settings) });
    return;
  }
  const lastAnnounced = statements.getSetting.get("discord_last_announced_version")?.value ?? "";
  if (releaseVersionAlreadyAnnounced({ lastAnnounced, appVersion })) {
    if (recordAlreadyAnnounced) recordDiscordDeliverySafe({ status: "skipped", eventType: "app_update", summary: `Version ${appVersion} is already announced.`, reason: `Version ${announcementKey} already announced`, metadata: discordDiagnosticContext("app_update", { version: appVersion, releaseKey, announcementKey, changelogUrl, lastAnnounced }, settings) });
    return { skipped: true, reason: `Version ${announcementKey} already announced` };
  }
  const updateDetails = await currentAppUpdateDetails();
  return enqueueDiscordActivity(
    "app_update",
    updateDetails.summary,
    new Date().toISOString(),
    { version: appVersion, releaseKey, announcementKey, changelogUrl, changeNotes: updateDetails.changeNotes },
    { sourceKey: `app_update:${announcementKey}`, settings },
  );
}
async function runDiscordAppUpdateAnnouncementJob() {
  return announceDiscordAppUpdateIfNeeded({ recordAlreadyAnnounced: false });
}

function discordSupplyEmbed(claim) {
  const supplies = toNumber(claim.supplies);
  const supplyMeta = supplyRunwayMetadata(claim, supplies);
  return discordCommandEmbed("Settlement Supplies", `**${claim.name ?? "Monitored settlement"}** supply status`, [
    { name: "Current stock", value: supplies.toLocaleString(), inline: true },
    { name: "Upkeep", value: supplyMeta.upkeep, inline: true },
    { name: "Runway", value: supplyMeta.runway, inline: true },
    ...(supplyMeta.runsOutAt ? [{ name: "Runs out", value: new Date(supplyMeta.runsOutAt).toLocaleString("en-GB", { timeZone: "Europe/London" }), inline: false }] : []),
  ], supplyMeta.runwayDays < 3 ? 0xef6461 : supplyMeta.runwayDays < 7 ? 0xf0c64f : 0x4ee28a);
}

async function sendScheduledSupplyReportIfDue(claim) {
  const settings = getDiscordSettingsRaw();
  if (!settings.enabled || !settings.botToken || !settings.notify.supplyReports) {
    recordDiscordDeliverySafe({ status: "skipped", eventType: "supply_report", summary: "Scheduled supply report", reason: "Discord disabled, bot token missing, or scheduled reports disabled", metadata: discordDiagnosticContext("supply_report", {}, settings) });
    return;
  }
  const lastSent = statements.getSetting.get("discord_last_supply_report_at")?.value ?? "";
  const lastSentMs = lastSent ? new Date(lastSent).getTime() : 0;
  const intervalMs = settings.supplyReportIntervalDays * 24 * 60 * 60 * 1000;
  if (lastSentMs && Date.now() - lastSentMs < intervalMs) return;
  const channelKey = settings.notificationChannels?.supplyReport ?? "modNotes";
  const channelId = resolveDiscordChannelSelection(channelKey, settings, settings.channelId);
  try {
    const response = await sendDiscordMessage({
      embeds: [discordSupplyEmbed(claim)],
      allowed_mentions: { parse: [] },
    }, settings, channelId);
    recordDiscordDeliverySafe({ status: "sent", eventType: "supply_report", channelId, channelKey, summary: "Scheduled supply report", metadata: discordDiagnosticContext("supply_report", { claimId: claim.entityId ?? claim.id, supplies: claim.supplies }, settings), response: { id: response?.id, channel_id: response?.channel_id } });
  } catch (error) {
    recordDiscordDeliverySafe({ status: "failed", eventType: "supply_report", channelId, channelKey, summary: "Scheduled supply report", error: error instanceof Error ? error.message : String(error), metadata: discordDiagnosticContext("supply_report", { claimId: claim.entityId ?? claim.id, supplies: claim.supplies }, settings) });
    throw error;
  }
  statements.upsertSetting.run("discord_last_supply_report_at", new Date().toISOString(), new Date().toISOString());
}

const deployableStorageName = /\b(?:cart|handcart|wagon|boat|ship|goat|sled|mount)\b/i;

function storageContainerName(building) {
  return String(building?.buildingNickname ?? "").trim() || building?.buildingName || building?.name || "Storage";
}

function isDeployableStorage(building) {
  return deployableStorageName.test(String(building?.buildingName ?? building?.name ?? ""));
}


function usedTradeIdsForListing(listingKey) {
  const rows = db.prepare("SELECT trade_id FROM market_events WHERE listing_key = ? AND trade_id IS NOT NULL").all(listingKey);
  return new Set(rows.flatMap((row) => String(row.trade_id).split(",")).filter(Boolean));
}

async function findConfirmedTrade(listing, minQuantity = 1) {
  if (!listing.ownerEntityId) return null;
  try {
    const usedTradeIds = usedTradeIdsForListing(listing.key);
    const matches = [];
    let offset = 0;
    while (offset < 1000) {
      const url = new URL(`${process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com"}/api/market/player/${listing.ownerEntityId}/trades`);
      url.searchParams.set("type", "sell");
      url.searchParams.set("limit", "200");
      url.searchParams.set("offset", String(offset));
      url.searchParams.set("orderEntityId", listing.key);
      const response = await fetch(url, { headers: { accept: "application/json", "x-app-identifier": appIdentifier } });
      if (!response.ok) return null;
      const trades = unwrap(await response.json(), "trades", []);
      matches.push(...trades.filter((trade) => tradeMatchesListing(trade, listing) && (!trade.id || !usedTradeIds.has(String(trade.id)))));
      const matchedQuantity = matches.reduce((total, trade) => total + toNumber(trade.quantity), 0);
      if (matchedQuantity >= minQuantity) {
        const totalPrice = matches.reduce((total, trade) => total + toNumber(trade.totalPrice ?? trade.total_price ?? toNumber(trade.quantity) * toNumber(trade.price ?? trade.unitPrice)), 0);
        return {
          ...matches[0],
          id: matches.map((trade) => trade.id).filter(Boolean).join(","),
          quantity: matchedQuantity,
          totalPrice,
          matchedTrades: matches,
        };
      }
      if (trades.length < 200) break;
      offset += trades.length;
    }
    return null;
  } catch {
    return null;
  }
}

async function findPendingMarketConfirmations(claimId) {
  const confirmations = [];
  for (const event of statements.pendingMarketEvents.all(claimId)) {
    let raw = {};
    try {
      raw = JSON.parse(event.raw_json ?? "{}");
    } catch {
      raw = {};
    }
    const listing = {
      key: event.listing_key,
      itemName: event.item_name,
      side: event.side ?? "sell",
      owner: event.owner,
      ownerEntityId: event.owner_entity_id ?? raw.ownerEntityId,
      itemId: event.item_id ?? raw.itemId,
      itemType: event.item_type ?? raw.itemType,
      quantity: toNumber(event.quantity),
      price: toNumber(event.price),
      totalValue: toNumber(event.total_value),
      tier: event.tier,
      rarity: event.rarity,
      raw,
    };
    const trade = await findConfirmedTrade(listing, listing.quantity);
    if (!trade) continue;
    confirmations.push({ event, listing, trade });
  }
  return confirmations;
}

function applyPendingMarketConfirmations(claimId, now, confirmations) {
  for (const { event, listing, trade } of confirmations) {
    const nextType = event.event_type === "partial_quantity_drop" ? "partial_sale" : "sale";
    for (const fill of trade.matchedTrades ?? [trade]) insertConfirmedMarketTrade(claimId, fill, listing, now);
    statements.confirmMarketEvent.run(nextType, trade.id ?? null, JSON.stringify(trade), event.id);
    addActivity(
      claimId,
      "market_sale_confirmed",
      `Confirmed sale: ${listing.itemName} x${listing.quantity.toLocaleString()} at ${listing.price.toLocaleString()}g`,
      now,
      { ...listing, tradeId: trade.id ?? null },
      `market_sale_confirmed:${listing.key}:${trade.id ?? ""}`,
    );
  }
}

function insertConfirmedMarketTrade(claimId, trade, listing = {}, importedAt = new Date().toISOString()) {
  const tradeId = String(trade.id ?? "").trim();
  if (!tradeId) return 0;
  const quantity = toNumber(trade.quantity);
  const unitPrice = toNumber(trade.unitPrice ?? trade.price ?? listing.price);
  const totalPrice = toNumber(trade.totalPrice ?? trade.total_price) || quantity * unitPrice;
  return Number(statements.insertMarketTrade.run(
    tradeId,
    claimId,
    trade.orderEntityId == null ? String(listing.key ?? "") || null : String(trade.orderEntityId),
    trade.sellerEntityId == null ? String(listing.ownerEntityId ?? "") || null : String(trade.sellerEntityId),
    trade.sellerUsername ?? listing.owner ?? null,
    trade.purchaserEntityId == null ? null : String(trade.purchaserEntityId),
    trade.purchaserUsername ?? null,
    trade.itemId == null ? (listing.itemId == null ? null : String(listing.itemId)) : String(trade.itemId),
    trade.itemType == null ? (listing.itemType == null ? null : String(listing.itemType)) : String(trade.itemType),
    String(trade.itemName ?? listing.itemName ?? "Unknown item"),
    quantity,
    unitPrice,
    totalPrice,
    trade.itemTier == null ? (listing.tier == null ? null : String(listing.tier)) : String(trade.itemTier),
    trade.itemRarityStr ?? listing.rarity ?? null,
    tradeOccurredAt(trade, importedAt),
    importedAt,
    JSON.stringify(trade),
  ).changes);
}

function addMarketEvent(claimId, eventType, listing, occurredAt) {
  const sourceKey = marketEventSourceKey(eventType, listing);
  statements.insertMarketEvent.run(
    claimId,
    eventType,
    listing.key,
    listing.itemName,
    listing.side,
    listing.owner,
    listing.ownerEntityId,
    listing.itemId == null ? null : String(listing.itemId),
    listing.itemType == null ? null : String(listing.itemType),
    listing.quantity,
    listing.price,
    listing.totalValue,
    listing.tier == null ? null : String(listing.tier),
    listing.rarity,
    occurredAt,
    listing.tradeId,
    sourceKey,
    JSON.stringify(listing.raw),
  );
}

function craftOutputCatalog(craftsPayload) {
  return new Map([...(craftsPayload?.items ?? []), ...(craftsPayload?.cargos ?? [])].map((item) => [String(item.id), item]));
}

function craftPrimarySkill(craft) {
  const skillId = toNumber(craft.levelRequirements?.[0]?.skill_id ?? craft.experiencePerProgress?.[0]?.skill_id);
  return skillId ? skillNames[skillId] ?? `Profession ${skillId}` : "";
}

function craftExperiencePerProgress(craft) {
  const skillId = toNumber(craft.levelRequirements?.[0]?.skill_id ?? craft.experiencePerProgress?.[0]?.skill_id);
  const match = craft.experiencePerProgress?.find?.((entry) => toNumber(entry.skill_id) === skillId);
  return toNumber(match?.quantity ?? craft.experiencePerProgress?.[0]?.quantity);
}

function craftContributionOutputItem(craft, catalog) {
  const outputId = craft.craftedItem?.[0]?.item_id;
  return catalog.get(String(outputId)) ?? {};
}

function craftContributionRecord(claimId, craft, contribution, catalog, observedAt) {
  const craftId = String(craft.entityId ?? "").trim();
  const contributorId = String(contribution.contributorEntityId ?? contribution.playerEntityId ?? contribution.entityId ?? "").trim();
  if (!craftId || !contributorId) return null;
  const item = craftContributionOutputItem(craft, catalog);
  const progress = toNumber(contribution.totalProgressContributed ?? contribution.contributedProgress ?? contribution.progress);
  const xpPerProgress = craftExperiencePerProgress(craft);
  return {
    key: `${claimId}:${craftId}:${contributorId}`,
    claimId,
    craftId,
    contributorId,
    contributorName: String(contribution.contributorUsername ?? contribution.username ?? contribution.userName ?? contributorId),
    profession: craftPrimarySkill(craft),
    craftLabel: String(item.name ?? craft.recipeName ?? craft.craftedItemName ?? "Unknown craft"),
    structureName: String(craft.buildingName ?? craft.structureName ?? "Unknown structure"),
    itemTier: item.tier == null ? (craft.tier == null ? null : String(craft.tier)) : String(item.tier),
    progress,
    xp: progress * xpPerProgress,
    count: toNumber(contribution.contributionCount),
    firstAt: contribution.firstContributedAt ?? null,
    lastAt: contribution.lastContributedAt ?? null,
    observedAt,
    raw: contribution,
  };
}

async function collectProductionContributionRecords(claimId, craftsPayload, observedAt) {
  const crafts = unwrap(craftsPayload, "craftResults", []).filter((craft) => craft?.entityId);
  const catalog = craftOutputCatalog(craftsPayload);
  const entries = await mapWithConcurrency(crafts, 4, async (craft) => {
    try {
      const contributions = await fetchCachedCraftContributions(craft.entityId);
      return contributions
        .map((contribution) => craftContributionRecord(claimId, craft, contribution, catalog, observedAt))
        .filter(Boolean);
    } catch {
      return [];
    }
  });
  return entries.flat();
}

function persistProductionContributions(records) {
  for (const record of records) {
    statements.upsertProductionContribution.run(
      record.key,
      record.claimId,
      record.craftId,
      record.contributorId,
      record.contributorName,
      record.profession || null,
      record.craftLabel,
      record.structureName,
      record.itemTier,
      record.progress,
      record.xp,
      record.count,
      record.firstAt,
      record.lastAt,
      record.observedAt,
      record.observedAt,
      JSON.stringify(record.raw),
    );
  }
}

function writeSettlementSnapshot(claimId, now, payload, summary) {
  const previous = statements.latestSnapshot.get(claimId);
  const claim = payload.claim ?? {};
  const supplyMeta = supplyRunwayMetadata(claim, summary.supplies);
  db.exec("BEGIN");
  try {
    statements.insertSnapshot.run(
      claimId,
      now,
      summary.supplies,
      summary.treasury,
      summary.membersCount,
      summary.buildingsCount,
      summary.marketCount,
      JSON.stringify(payload),
    );
    for (const change of snapshotActivityChanges(previous, summary, { supplyMetadata: supplyMeta })) {
      addActivity(claimId, change.type, change.summary, now, change.metadata);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function syncMarketListingsForSnapshot(claimId, marketPayload, now) {
  const market = unwrap(marketPayload, "listings", []);
  const normalizedListings = market.map(normalizeListing);
  const seen = new Set(normalizedListings.map((listing) => listing.key));
  const existingListings = new Map(normalizedListings.map((listing) => [listing.key, statements.listingByKey.get(listing.key)]));
  const partialCandidates = normalizedListings
    .map((listing) => ({ listing, existing: existingListings.get(listing.key) }))
    .filter(({ listing, existing }) => existing && listing.quantity < toNumber(existing.quantity))
    .map(({ listing, existing }) => ({ listing, soldQuantity: toNumber(existing.quantity) - listing.quantity }));
  const closedCandidates = statements.activeListings.all(claimId).filter((active) => !seen.has(active.listing_key)).map((active) => {
    const raw = safeJson(active.raw_json);
    return {
      active,
      listing: {
        key: active.listing_key,
        itemName: active.item_name,
        side: active.side ?? "sell",
        owner: active.owner,
        ownerEntityId: active.owner_entity_id ?? raw.ownerEntityId,
        itemId: active.item_id ?? raw.itemId,
        itemType: active.item_type ?? raw.itemType,
        quantity: toNumber(active.quantity),
        price: toNumber(active.price),
        totalValue: toNumber(active.total_value),
        tier: active.tier,
        rarity: active.rarity,
        raw,
      },
    };
  });
  const [partialChecks, closedChecks, pendingConfirmations] = await Promise.all([
    mapWithConcurrency(partialCandidates, 4, async ({ listing, soldQuantity }) => ({ listing, soldQuantity, trade: await findConfirmedTrade(listing, soldQuantity) })),
    mapWithConcurrency(closedCandidates, 4, async ({ active, listing }) => ({ active, listing, trade: await findConfirmedTrade(listing, listing.quantity) })),
    findPendingMarketConfirmations(claimId),
  ]);
  const partialResults = new Map(partialChecks.map((result) => [result.listing.key, result]));
  const closedResults = new Map(closedChecks.map((result) => [result.listing.key, result]));

  db.exec("BEGIN");
  try {
    for (const listing of normalizedListings) {
      const existing = existingListings.get(listing.key);
      statements.upsertListing.run(
        listing.key,
        claimId,
        listing.itemName,
        listing.side,
        listing.owner,
        listing.ownerEntityId,
        listing.itemId == null ? null : String(listing.itemId),
        listing.itemType == null ? null : String(listing.itemType),
        listing.quantity,
        listing.price,
        listing.totalValue,
        listing.tier == null ? null : String(listing.tier),
        listing.rarity,
        existing?.first_seen ?? listing.listedAt ?? now,
        now,
        JSON.stringify(listing.raw),
      );
      if (!existing) {
        addMarketEvent(claimId, "new_listing", listing, now);
        addActivity(
          claimId,
          "market_new_listing",
          `New market listing: ${listing.itemName} x${listing.quantity.toLocaleString()} at ${listing.price.toLocaleString()}g`,
          now,
          listing,
          `market_new_listing:${listing.key}`,
        );
      } else if (listing.quantity < toNumber(existing.quantity)) {
        const { soldQuantity, trade } = partialResults.get(listing.key);
        const partial = { ...listing, quantity: soldQuantity, totalValue: soldQuantity * listing.price, tradeId: trade?.id ?? null, raw: trade ?? listing.raw };
        if (trade) for (const fill of trade.matchedTrades ?? [trade]) insertConfirmedMarketTrade(claimId, fill, listing, now);
        addMarketEvent(claimId, trade ? "partial_sale" : "partial_quantity_drop", partial, now);
        addActivity(
          claimId,
          trade ? "market_sale" : "market_quantity_drop",
          `${trade ? "Partial sale" : "Quantity dropped"}: ${listing.itemName} x${soldQuantity.toLocaleString()} at ${listing.price.toLocaleString()}g`,
          now,
          partial,
          `${trade ? "market_sale" : "market_quantity_drop"}:${listing.key}:${trade?.id ?? `${soldQuantity}:${listing.quantity}`}`,
        );
      }
    }

    for (const { active, listing } of closedCandidates) {
      const trade = closedResults.get(listing.key)?.trade;
      const eventType = trade ? "sale" : "removed_or_cancelled";
      const closedListing = { ...listing, tradeId: trade?.id ?? null, raw: trade ?? listing.raw };
      if (trade) for (const fill of trade.matchedTrades ?? [trade]) insertConfirmedMarketTrade(claimId, fill, listing, now);
      statements.markListingClosed.run(eventType, now, now, active.listing_key);
      addMarketEvent(claimId, eventType, closedListing, now);
      addActivity(
        claimId,
        trade ? "market_sale" : "market_removed_or_cancelled",
        `${trade ? "Sold" : "Removed/cancelled"}: ${listing.itemName} x${listing.quantity.toLocaleString()} at ${listing.price.toLocaleString()}g`,
        now,
        closedListing,
        `${trade ? "market_sale" : "market_removed_or_cancelled"}:${listing.key}:${trade?.id ?? ""}`,
      );
    }

    applyPendingMarketConfirmations(claimId, now, pendingConfirmations);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function syncProductionJobActivityForSnapshot(claimId, craftsPayload, now) {
  if (!craftsPayload) return { pendingNotifications: [], diagnostics: [] };
  db.exec("BEGIN");
  try {
    const productionResult = recordProductionJobs(claimId, craftsPayload, now);
    db.exec("COMMIT");
    return productionResult;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function syncProductionContributionsForSnapshot(claimId, craftsPayload, now) {
  if (!craftsPayload) return;
  const productionContributionRecords = await collectProductionContributionRecords(claimId, craftsPayload, now);
  db.exec("BEGIN");
  try {
    persistProductionContributions(productionContributionRecords);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function recordSnapshot(payload) {
  const now = new Date().toISOString();
  const summary = snapshotSummary(payload);
  const claimId = summary.claimId;
  if (!claimId) throw new Error("Missing claim id");

  writeSettlementSnapshot(claimId, now, payload, summary);
  return { ok: true, capturedAt: now };
}
async function fetchBitjita(pathname, options = {}) {
  // Central BitJita client used by collectors and local helper endpoints. Keep
  // the identifying header here so upstream sees a consistent app identity, and
  // prefer adding resilience here instead of duplicating fetch logic in callers.
  const url = new URL(`${process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com"}/api${pathname}`);
  const timeoutMs = Math.max(0, toNumber(options.timeoutMs ?? BITJITA_FETCH_TIMEOUT_MS));
  let response;
  try {
    if (options.cache === false) {
      const fetchOptions = { headers: { accept: "application/json", "x-app-identifier": appIdentifier } };
      if (timeoutMs > 0) fetchOptions.signal = AbortSignal.timeout(timeoutMs);
      response = await fetch(url, fetchOptions);
      if (!response.ok) throw new Error(`${pathname}: HTTP ${response.status}`);
      return response.json();
    }
    response = await bitjitaProxyCache.fetchUpstreamCached(url, { timeoutMs });
  } catch (error) {
    if (timeoutMs > 0 && error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error(`${pathname}: timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    if (error instanceof TypeError && String(error.message ?? "").toLowerCase().includes("fetch failed")) {
      const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
      throw new Error(`${pathname}: BitJita network request failed${cause}`);
    }
    throw error;
  }
  if (response.status < 200 || response.status >= 300) throw new Error(`${pathname}: HTTP ${response.status}`);
  try {
    return JSON.parse(Buffer.from(response.body).toString("utf8"));
  } catch {
    throw new Error(`${pathname}: BitJita returned invalid JSON`);
  }
}

async function fetchAllClaimListings(claimId, options = {}) {
  const side = String(options.side ?? "").toLowerCase();
  const sideParam = side === "buy" || side === "sell" ? `&side=${side}` : "";
  const base = `/claims/${claimId}/market/listings?limit=200${sideParam}`;
  const first = await fetchBitjita(`${base}&page=1`, { cache: options.cache !== false });
  const totalPages = Math.max(toNumber(first.totalPages) || 1, 1);
  const pages = totalPages > 1
    ? await mapWithConcurrency(Array.from({ length: totalPages - 1 }, (_, index) => index + 2), 4, (page) => fetchBitjita(`${base}&page=${page}`, { cache: options.cache !== false }))
    : [];
  return { ...first, listings: [first, ...pages].flatMap((page) => unwrap(page, "listings", [])), page: 1, totalPages };
}

async function fetchRegionClaimList(regionId) {
  const key = String(regionId);
  const cached = regionClaimListCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const base = `/claims?regionId=${encodeURIComponent(key)}&limit=100&sort=supplies&order=desc`;
  const first = await fetchBitjita(`${base}&page=1`);
  const totalPages = Math.max(Math.ceil(toNumber(first.count) / 100), 1);
  const pages = totalPages > 1
    ? await mapWithConcurrency(Array.from({ length: totalPages - 1 }, (_, index) => index + 2), 4, (page) => fetchBitjita(`${base}&page=${page}`))
    : [];
  const value = { ...first, claims: [first, ...pages].flatMap((page) => unwrap(page, "claims", [])), page: 1, totalPages };
  regionClaimListCache.set(key, { expiresAt: Date.now() + 5 * 60 * 1000, value });
  return value;
}

function empireCacheGet(key) {
  const cached = empireScoutCache.get(key);
  return cached && cached.expiresAt > Date.now() ? cached.value : null;
}

function empireCacheGetAny(key) {
  return empireScoutCache.get(key)?.value ?? null;
}

async function empireCacheLoad(key, loader) {
  const cached = empireCacheGet(key);
  if (cached) return cached;
  const inflight = empireScoutInflight.get(key);
  if (inflight) return inflight;
  const stale = empireCacheGetAny(key);
  const request = (async () => {
    try {
      const value = await loader();
      empireScoutCache.set(key, { value, expiresAt: Date.now() + EMPIRE_SCOUT_CACHE_TTL_MS });
      return value;
    } catch (error) {
      if (stale) {
        return { ...stale, stale: true, partial: true, errors: [...(stale.errors ?? []), errorMessage(error)] };
      }
      throw error;
    } finally {
      empireScoutInflight.delete(key);
    }
  })();
  empireScoutInflight.set(key, request);
  return request;
}

function empireIdFromClaim(claim) {
  return String(claim?.empireEntityId ?? claim?.empireId ?? claim?.empire?.entityId ?? "").trim();
}

function normalizeEmpireOverviewRow(empire, regionalClaims) {
  const entityId = String(empire?.entityId ?? empire?.id ?? "").trim();
  const claims = regionalClaims.filter((claim) => empireIdFromClaim(claim) === entityId);
  return {
    entityId,
    name: String(empire?.name ?? `Empire ${entityId}`),
    leader: String(empire?.leader ?? empire?.leaderName ?? "Unknown"),
    leaderEntityId: String(empire?.leaderEntityId ?? ""),
    memberCount: toNumber(empire?.memberCount ?? empire?.membersCount),
    territoryChunks: toNumber(empire?.territoryChunks),
    numClaims: toNumber(empire?.numClaims),
    regionalClaims: claims.length,
    empireCurrencyTreasury: toNumber(empire?.empireCurrencyTreasury),
    shardTreasury: toNumber(empire?.shardTreasury),
    capitalBuildingEntityId: empire?.capitalBuildingEntityId ?? null,
    locationX: empire?.locationX ?? null,
    locationZ: empire?.locationZ ?? null,
    locationDimension: empire?.locationDimension ?? null,
    createdAt: empire?.createdAt ?? null,
    updatedAt: empire?.updatedAt ?? null,
    regionalClaimNames: claims.map((claim) => claim?.name).filter(Boolean).slice(0, 8),
  };
}

async function regionalEmpireOverview(regionId) {
  const key = `overview:${regionId}`;
  return empireCacheLoad(key, async () => {
    const [claimPayload, empirePayload] = await Promise.all([
      fetchRegionClaimList(regionId),
      fetchBitjita("/empires"),
    ]);
    const claims = unwrap(claimPayload, "claims", []);
    const regionalEmpireIds = new Set(claims.map(empireIdFromClaim).filter(Boolean));
    const allEmpires = Array.isArray(empirePayload) ? empirePayload : unwrap(empirePayload, "empires", []);
    const empires = allEmpires
      .filter((empire) => regionalEmpireIds.has(String(empire?.entityId ?? empire?.id ?? "")))
      .map((empire) => normalizeEmpireOverviewRow(empire, claims))
      .filter((empire) => empire.entityId)
      .sort((a, b) => b.regionalClaims - a.regionalClaims || b.memberCount - a.memberCount || a.name.localeCompare(b.name));
    const largestEmpire = [...empires].sort((a, b) => b.memberCount - a.memberCount || b.regionalClaims - a.regionalClaims)[0] ?? null;
    return {
      regionId: String(regionId),
      fetchedAt: new Date().toISOString(),
      totalRegionalClaims: claims.length,
      empireClaimCount: claims.filter((claim) => empireIdFromClaim(claim)).length,
      empires,
      summary: {
        empires: empires.length,
        regionalClaims: claims.filter((claim) => empireIdFromClaim(claim)).length,
        totalMembers: empires.reduce((sum, empire) => sum + toNumber(empire.memberCount), 0),
        largestEmpireName: largestEmpire?.name ?? null,
      },
    };
  });
}

function lastLoginMs(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function leaderCandidates(empire, members) {
  const leaderId = String(empire?.leaderEntityId ?? "");
  const candidates = members.filter((member) => {
    const memberId = String(member?.entityId ?? member?.playerEntityId ?? "");
    const rankTitle = String(member?.rankTitle ?? member?.rank ?? "").trim().toLowerCase();
    return memberId === leaderId || (rankTitle && rankTitle !== "citizen");
  });
  if (candidates.length) return candidates;
  return members.filter((member) => String(member?.entityId ?? member?.playerEntityId ?? "") === leaderId).slice(0, 1);
}

function empireInactivity(empire, members, inactiveDays) {
  const candidates = leaderCandidates(empire, members);
  const thresholdMs = Date.now() - Math.max(1, toNumber(inactiveDays)) * 24 * 60 * 60 * 1000;
  const latest = candidates.reduce((best, member) => Math.max(best, lastLoginMs(member?.lastLoginTimestamp)), 0);
  const activeLeaderCount = candidates.filter((member) => lastLoginMs(member?.lastLoginTimestamp) >= thresholdMs).length;
  return {
    inactiveRisk: candidates.length > 0 && activeLeaderCount === 0,
    leaderCount: candidates.length,
    activeLeaderCount,
    lastLeaderLogin: latest ? new Date(latest).toISOString() : null,
    inactivityReason: candidates.length ? (activeLeaderCount ? "Leader/noble activity found" : `No leader or noble login within ${inactiveDays} days`) : "No leader/noble data returned by BitJita",
  };
}

function nestedCoordinate(source, axis) {
  const directKeys = axis === "x" ? ["locationX", "x", "coordX", "coordinateX", "worldX"] : ["locationZ", "z", "coordZ", "coordinateZ", "worldZ"];
  for (const key of directKeys) {
    if (source?.[key] != null) return source[key];
  }
  const nested = source?.location ?? source?.position ?? source?.coordinates ?? source?.coord ?? source?.coords;
  if (Array.isArray(nested)) return axis === "x" ? nested[0] : nested[1];
  if (nested && typeof nested === "object") {
    for (const key of directKeys) {
      if (nested[key] != null) return nested[key];
    }
  }
  return null;
}

function normalizeEmpireMember(member) {
  const permissions = parseMemberPermissions(member);
  const rawHexiteAccess = member?.canAddHexite ?? member?.addHexitePermission ?? member?.hexitePermission ?? member?.canContributeHexite ?? member?.claimHexitePermission;
  const canAddHexite = rawHexiteAccess != null ? Boolean(rawHexiteAccess === true || rawHexiteAccess === 1 || String(rawHexiteAccess).toLowerCase() === "true") : Boolean(permissions.coOwnerPermission || permissions.officerPermission || permissions.buildPermission);
  const hasStorage = Boolean(permissions.inventoryPermission);
  return {
    entityId: String(member?.entityId ?? member?.playerEntityId ?? member?.id ?? ""),
    username: String(member?.username ?? member?.userName ?? member?.playerName ?? "Unknown"),
    rankTitle: String(member?.rankTitle ?? member?.rank ?? "Citizen"),
    lastLoginTimestamp: member?.lastLoginTimestamp ?? member?.lastSeenAt ?? member?.lastSeen ?? null,
    signedIn: member?.signedIn === true || member?.online === true,
    hasStorage,
    canAddHexite,
    permissions,
  };
}

function compareEmpireMembers(a, b) {
  if (Boolean(a.signedIn) !== Boolean(b.signedIn)) return a.signedIn ? -1 : 1;
  return lastLoginMs(b.lastLoginTimestamp) - lastLoginMs(a.lastLoginTimestamp) || String(a.username).localeCompare(String(b.username));
}

function normalizeEmpireTower(tower, empire, inactivity) {
  const siege = Array.isArray(tower?.siege) ? tower.siege : [];
  const locationX = nestedCoordinate(tower, "x");
  const locationZ = nestedCoordinate(tower, "z");
  return {
    id: String(tower?.entityId ?? tower?.id ?? ""),
    towerId: String(tower?.entityId ?? tower?.id ?? ""),
    empireId: empire.entityId,
    empireName: empire.name,
    nickname: String(tower?.nickname ?? tower?.name ?? "Watchtower"),
    locationX,
    locationZ,
    locationDimension: tower?.locationDimension ?? tower?.dimension ?? tower?.location?.dimension ?? null,
    energy: toNumber(tower?.energy),
    upkeep: toNumber(tower?.upkeep),
    active: tower?.active === true,
    siegeCount: siege.length,
    siege,
    inactiveRisk: inactivity.inactiveRisk,
    lastLeaderLogin: inactivity.lastLeaderLogin,
    inactivityReason: inactivity.inactivityReason,
  };
}

async function regionalEmpireWatchtowers(regionId, inactiveDays = 14) {
  const days = Math.max(1, Math.min(365, toNumber(inactiveDays) || 14));
  const key = `watchtowers:${regionId}:${days}`;
  return empireCacheLoad(key, async () => {
    const overview = await regionalEmpireOverview(regionId);
    const errors = [];
    const startedAt = Date.now();
    const deadlineMs = Math.max(5000, Math.min(BITJITA_FETCH_TIMEOUT_MS - 1500, 14_000));
    let deadlineHit = false;
    const empireRows = await mapWithConcurrency(overview.empires, 2, async (empire) => {
      if (Date.now() - startedAt > deadlineMs) {
        deadlineHit = true;
        return { ...empire, inactiveRisk: false, leaderCount: 0, activeLeaderCount: 0, lastLeaderLogin: null, inactivityReason: "Skipped because the watchtower scan deadline was reached", members: [], accessMembers: [], towerCount: 0, towers: [] };
      }
      try {
        const [detailPayload, towerPayload] = await Promise.all([
          fetchBitjita(`/empires/${encodeURIComponent(empire.entityId)}`, { timeoutMs: Math.min(8000, BITJITA_FETCH_TIMEOUT_MS) }),
          fetchBitjita(`/empires/${encodeURIComponent(empire.entityId)}/towers`, { timeoutMs: Math.min(8000, BITJITA_FETCH_TIMEOUT_MS) }),
        ]);
        const detailEmpire = detailPayload?.empire ?? empire;
        const members = unwrap(detailPayload, "members", []);
        const towers = Array.isArray(towerPayload) ? towerPayload : unwrap(towerPayload, "towers", []);
        const inactivity = empireInactivity({ ...empire, ...detailEmpire }, members, days);
        const normalizedMembers = members.map(normalizeEmpireMember).sort(compareEmpireMembers);
        const accessMembers = normalizedMembers.filter((member) => member.hasStorage || member.canAddHexite);
        return {
          ...empire,
          ...inactivity,
          members: normalizedMembers,
          accessMembers,
          towerCount: towers.length,
          towers: towers.map((tower) => normalizeEmpireTower(tower, empire, inactivity)).filter((tower) => tower.towerId),
        };
      } catch (error) {
        errors.push(`${empire.name}: ${error instanceof Error ? error.message : String(error)}`);
        return { ...empire, inactiveRisk: false, leaderCount: 0, activeLeaderCount: 0, lastLeaderLogin: null, inactivityReason: "Empire detail unavailable", members: [], accessMembers: [], towerCount: 0, towers: [] };
      }
    });
    if (deadlineHit) errors.push("Watchtower scan stopped early to avoid timing out. Showing partial results; retry after the cache refreshes.");
    const towers = empireRows.flatMap((empire) => empire.towers);
    return {
      regionId: String(regionId),
      inactiveDays: days,
      fetchedAt: new Date().toISOString(),
      partial: deadlineHit,
      unclaimedAvailable: false,
      unclaimedMessage: "Unclaimed watchtowers are not exposed by the current BitJita public API.",
      empires: empireRows,
      towers,
      errors,
      summary: {
        towerCount: towers.length,
        inactiveRiskEmpires: empireRows.filter((empire) => empire.inactiveRisk).length,
        underSiege: towers.filter((tower) => tower.siegeCount > 0).length,
        activeTowers: towers.filter((tower) => tower.active).length,
      },
    };
  });
}
function buyOrderKey(listing) {
  return String(listing.entityId ?? listing.id ?? `${listing.claimEntityId ?? "claim"}:${listing.itemType ?? ""}:${listing.itemId ?? ""}:${listing.ownerEntityId ?? ""}:${listing.price ?? ""}`);
}

function normalizeRegionalBuyOrder(listing, regionId, regionName, fallbackClaim = {}) {
  const quantity = toNumber(listing.quantity);
  const unitPrice = toNumber(listing.priceThreshold ?? listing.unitPrice ?? listing.price);
  const marketClaimId = String(listing.claimEntityId ?? fallbackClaim.entityId ?? fallbackClaim.claimId ?? "").trim();
  const itemTypeRaw = listing.itemType ?? listing.item_type;
  const itemType = String(itemTypeRaw === "cargo" ? 1 : itemTypeRaw === "item" ? 0 : itemTypeRaw ?? 0);
  const listedAt = listing.timestamp ?? listing.createdAt ?? listing.updatedAt ?? null;
  return {
    orderKey: buyOrderKey(listing),
    regionId: String(listing.regionId ?? regionId ?? "").trim(),
    regionName: String(listing.regionName ?? regionName ?? ""),
    marketClaimId,
    marketClaimName: String(listing.claimName ?? listing.claim?.name ?? fallbackClaim.name ?? fallbackClaim.claimName ?? "Unknown settlement"),
    buyerEntityId: String(listing.ownerEntityId ?? listing.ownerId ?? ""),
    buyerName: String(listing.ownerUsername ?? listing.ownerName ?? listing.owner ?? "Unknown buyer"),
    itemId: String(listing.itemId ?? listing.item_id ?? ""),
    itemType,
    itemName: String(listing.itemName ?? listing.name ?? "Unknown item"),
    tier: listing.itemTier ?? listing.tier ?? null,
    rarity: listing.itemRarityStr ?? listing.rarityStr ?? listing.itemRarity ?? listing.rarity ?? null,
    iconAssetName: listing.iconAssetName ?? null,
    quantity,
    unitPrice,
    totalValue: quantity * unitPrice,
    storedCoins: toNumber(listing.storedCoins),
    listedAt,
    raw: listing,
  };
}

function dealWatchRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    discordId: row.discord_id,
    claimId: row.claim_id,
    regionId: row.region_id,
    itemId: row.item_id,
    itemType: row.item_type,
    itemName: row.item_name,
    tier: row.tier,
    rarity: row.rarity,
    iconAssetName: row.icon_asset_name,
    thresholdPercent: toNumber(row.threshold_percent),
    enabled: Boolean(toNumber(row.enabled)),
    lastCheckedAt: row.last_checked_at,
    lastAlertAt: row.last_alert_at,
    lastBaselineWindowDays: row.last_baseline_window_days,
    lastBaselineAverage: row.last_baseline_average,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRegionalSellListing(listing, regionId, regionName, fallbackClaim = {}) {
  const base = normalizeListing(listing);
  const marketClaimId = String(listing.claimEntityId ?? listing.claimId ?? fallbackClaim.entityId ?? fallbackClaim.claimId ?? "").trim();
  const itemTypeRaw = listing.itemType ?? listing.item_type ?? base.itemType ?? 0;
  const itemType = String(itemTypeRaw === "cargo" ? 1 : itemTypeRaw === "item" ? 0 : itemTypeRaw ?? 0);
  return {
    listingKey: base.key,
    regionId: String(listing.regionId ?? regionId ?? "").trim(),
    regionName: String(listing.regionName ?? regionName ?? ""),
    marketClaimId,
    marketClaimName: String(listing.claimName ?? listing.claim?.name ?? fallbackClaim.name ?? fallbackClaim.claimName ?? "Unknown settlement"),
    sellerName: String(listing.ownerUsername ?? listing.ownerName ?? listing.owner ?? "Unknown seller"),
    itemId: String(listing.itemId ?? listing.item_id ?? base.itemId ?? "").trim(),
    itemType,
    itemName: base.itemName,
    tier: base.tier,
    rarity: base.rarity,
    iconAssetName: listing.iconAssetName ?? null,
    quantity: base.quantity,
    unitPrice: base.price,
    totalValue: base.totalValue,
    listedAt: base.listedAt,
    raw: listing,
  };
}

function priceHistoryWindowAverage(payload, windowDays, minSales) {
  const buckets = unwrap(payload, "buckets", []);
  const stats = payload?.priceStats && typeof payload.priceStats === "object" ? payload.priceStats : {};
  const statsAverage = toNumber(windowDays === 7 ? stats.avg7d : stats.avg30d);
  const statsSales = toNumber(stats.totalTrades ?? stats.salesCount ?? stats.tradeCount);
  if (statsAverage > 0 && statsSales >= minSales) {
    return { averageUnitPrice: statsAverage, salesCount: statsSales, windowDays, raw: { source: `priceStats.avg${windowDays}d`, priceStats: stats } };
  }
  const relevantBuckets = windowDays === 7 ? buckets.slice(-7) : buckets.slice(-30);
  let salesCount = 0;
  let unitsSold = 0;
  let totalValue = 0;
  for (const bucket of relevantBuckets) {
    const totals = priceHistoryBucketTotals(bucket);
    salesCount += totals.salesCount;
    unitsSold += totals.unitsSold;
    totalValue += totals.totalValue;
  }
  if (salesCount < minSales || unitsSold <= 0 || totalValue <= 0) return null;
  return {
    averageUnitPrice: totalValue / unitsSold,
    salesCount,
    unitsSold,
    totalValue,
    windowDays,
    firstBucketAt: relevantBuckets[0]?.bucket ?? relevantBuckets[0]?.date ?? relevantBuckets[0]?.start ?? null,
    lastBucketAt: relevantBuckets.at(-1)?.bucket ?? relevantBuckets.at(-1)?.date ?? relevantBuckets.at(-1)?.start ?? null,
    raw: { source: "bucketTotals", bucketCount: relevantBuckets.length, priceStats: stats },
  };
}

async function dealBaselineForItem(regionId, itemId, itemType, minSales) {
  const historyKind = marketPriceHistoryKind(itemType);
  const payload = await fetchBitjita(`/market/${historyKind}/${encodeURIComponent(itemId)}/price-history?bucket=1%20day&limit=30&regionId=${encodeURIComponent(regionId)}`, { timeoutMs: 10000 });
  return priceHistoryWindowAverage(payload, 7, minSales) ?? priceHistoryWindowAverage(payload, 30, minSales);
}

async function runMarketDealWatchJob({ jobKey } = {}) {
  const settings = getSettings();
  const dealSettings = settings.marketDealWatch ?? marketDealWatchSettings();
  const watches = statements.listEnabledDealWatches.all();
  if (!watches.length) return { checked: 0, alerts: 0, regions: 0, reason: "No enabled deal watches" };
  const byRegion = new Map();
  for (const watch of watches) {
    const key = `${watch.claim_id}:${watch.region_id}`;
    if (!byRegion.has(key)) byRegion.set(key, []);
    byRegion.get(key).push(watch);
  }
  const now = new Date().toISOString();
  let checked = 0;
  let alerts = 0;
  const failures = [];
  for (const [groupKey, groupWatches] of byRegion.entries()) {
    const [, regionId] = groupKey.split(":");
    if (jobKey) updateScheduledJobProgress(jobKey, { step: `Loading R${regionId} markets`, regionId, checked, alerts });
    let claimPayload;
    try {
      claimPayload = await fetchRegionClaimList(regionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`R${regionId}: ${message}`);
      for (const watch of groupWatches) statements.updateDealWatchChecked.run(now, null, null, message, now, watch.id);
      continue;
    }
    const claims = unwrap(claimPayload, "claims", []);
    const regionName = claims.find((claim) => claim.regionName)?.regionName ?? `R${regionId}`;
    const watchedKeys = new Set(groupWatches.map((watch) => `${watch.item_type}:${watch.item_id}`));
    let completedClaims = 0;
    const listingPages = await mapWithConcurrency(claims, 3, async (claim) => {
      const marketClaimId = String(claim.entityId ?? claim.claimId ?? "").trim();
      if (!marketClaimId) return [];
      try {
        const payload = await fetchAllClaimListings(marketClaimId, { side: "sell" });
        completedClaims += 1;
        if (jobKey) updateScheduledJobProgress(jobKey, { step: `Scanning R${regionId} markets`, regionId, current: completedClaims, total: claims.length, checked, alerts });
        return unwrap(payload, "listings", [])
          .map((listing) => normalizeRegionalSellListing(listing, regionId, regionName, claim))
          .filter((listing) => watchedKeys.has(`${listing.itemType}:${listing.itemId}`));
      } catch (error) {
        failures.push(`${claim.name ?? marketClaimId}: ${error instanceof Error ? error.message : String(error)}`);
        completedClaims += 1;
        return [];
      }
    });
    const listings = listingPages.flat();
    const baselineCache = new Map();
    for (const watch of groupWatches) {
      checked += 1;
      const baselineKey = `${watch.region_id}:${watch.item_type}:${watch.item_id}`;
      let baseline = baselineCache.get(baselineKey);
      try {
        if (!baselineCache.has(baselineKey)) {
          baseline = await dealBaselineForItem(watch.region_id, watch.item_id, watch.item_type, dealSettings.minConfirmedSales);
          baselineCache.set(baselineKey, baseline ?? null);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        statements.updateDealWatchChecked.run(now, null, null, message, now, watch.id);
        failures.push(`${watch.item_name}: ${message}`);
        continue;
      }
      if (!baseline) {
        statements.updateDealWatchChecked.run(now, null, null, `Not enough confirmed regional sales (${dealSettings.minConfirmedSales}+ required)`, now, watch.id);
        continue;
      }
      statements.updateDealWatchChecked.run(now, baseline.windowDays, baseline.averageUnitPrice, null, now, watch.id);
      const maxPrice = baseline.averageUnitPrice * (1 - (toNumber(watch.threshold_percent) || dealSettings.thresholdPercent) / 100);
      for (const listing of listings.filter((entry) => entry.itemId === String(watch.item_id) && entry.itemType === String(watch.item_type) && toNumber(entry.unitPrice) > 0 && toNumber(entry.unitPrice) <= maxPrice)) {
        const discountPercent = Math.max(0, ((baseline.averageUnitPrice - listing.unitPrice) / baseline.averageUnitPrice) * 100);
        const createdAt = new Date().toISOString();
        const result = statements.insertDealAlert.run(
          watch.id, watch.user_id, watch.discord_id, watch.claim_id, watch.region_id, watch.item_id, watch.item_type, watch.item_name,
          watch.tier ?? listing.tier, watch.rarity ?? listing.rarity, watch.icon_asset_name ?? listing.iconAssetName,
          listing.listingKey, listing.marketClaimId, listing.marketClaimName, listing.sellerName, listing.quantity, listing.unitPrice, listing.totalValue,
          baseline.windowDays, baseline.averageUnitPrice, baseline.salesCount, discountPercent, "pending", null, createdAt,
          JSON.stringify({ listing: listing.raw, baseline: baseline.raw }),
        );
        if (!result.changes) continue;
        alerts += 1;
        statements.updateDealWatchAlerted.run(createdAt, createdAt, watch.id);
        const alert = publicDealAlertRow({
          id: result.lastInsertRowid,
          watch_id: watch.id,
          user_id: watch.user_id,
          discord_id: watch.discord_id,
          claim_id: watch.claim_id,
          region_id: watch.region_id,
          item_id: watch.item_id,
          item_type: watch.item_type,
          item_name: watch.item_name,
          tier: watch.tier ?? listing.tier,
          rarity: watch.rarity ?? listing.rarity,
          icon_asset_name: watch.icon_asset_name ?? listing.iconAssetName,
          listing_key: listing.listingKey,
          market_claim_id: listing.marketClaimId,
          market_claim_name: listing.marketClaimName,
          seller_name: listing.sellerName,
          quantity: listing.quantity,
          unit_price: listing.unitPrice,
          total_value: listing.totalValue,
          baseline_window_days: baseline.windowDays,
          baseline_average: baseline.averageUnitPrice,
          sales_count: baseline.salesCount,
          discount_percent: discountPercent,
          dm_status: "pending",
          dm_error: null,
          created_at: createdAt,
          read_at: null,
          raw_json: JSON.stringify({ listing: listing.raw, baseline: baseline.raw }),
        });
        if (dealSettings.discordDmEnabled) {
          try {
            await sendDiscordDirectMessage(watch.discord_id, dealAlertDiscordPayload(alert));
            statements.updateDealAlertDm.run("sent", null, result.lastInsertRowid);
          } catch (error) {
            statements.updateDealAlertDm.run("failed", error instanceof Error ? error.message : String(error), result.lastInsertRowid);
            recordDiscordDeliverySafe({ status: "failed", eventType: "market_deal_watch", summary: `Deal alert: ${watch.item_name}`, error: error instanceof Error ? error.message : String(error), metadata: { userId: watch.discord_id, regionId: watch.region_id, itemId: watch.item_id } });
          }
        } else {
          statements.updateDealAlertDm.run("skipped", "Discord DM alerts disabled", result.lastInsertRowid);
        }
      }
    }
  }
  return { checked, alerts, regions: byRegion.size, failures: failures.slice(0, 20) };
}
async function fetchRegionalBuyOrders(claimId, regionIds) {
  const uniqueRegionIds = [...new Set(regionIds.map((id) => String(id ?? "").trim()).filter((id) => /^\d+$/.test(id)))];
  const failures = [];
  const orders = [];
  for (const [regionIndex, regionId] of uniqueRegionIds.entries()) {
    collectorProgress("buyOrders", `Loading R${regionId} settlements`, { current: regionIndex + 1, total: uniqueRegionIds.length });
    let claimPayload;
    try {
      claimPayload = await fetchRegionClaimList(regionId);
    } catch (error) {
      failures.push(`R${regionId} claims: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const claims = unwrap(claimPayload, "claims", []);
    const regionName = claims.find((claim) => claim.regionName)?.regionName ?? `R${regionId}`;
    let completedClaims = 0;
    const pages = await mapWithConcurrency(claims, 3, async (claim) => {
      const marketClaimId = String(claim.entityId ?? claim.claimId ?? "").trim();
      if (!marketClaimId) {
        completedClaims += 1;
        collectorProgress("buyOrders", `Scanning R${regionId} markets`, { current: completedClaims, total: claims.length });
        return [];
      }
      try {
        const payload = await fetchAllClaimListings(marketClaimId, { side: "buy" });
        completedClaims += 1;
        collectorProgress("buyOrders", `Scanning R${regionId} markets`, { current: completedClaims, total: claims.length });
        return unwrap(payload, "listings", []).map((listing) => normalizeRegionalBuyOrder(listing, regionId, regionName, claim));
      } catch (error) {
        failures.push(`${claim.name ?? marketClaimId}: ${error instanceof Error ? error.message : String(error)}`);
        completedClaims += 1;
        collectorProgress("buyOrders", `Scanning R${regionId} markets`, { current: completedClaims, total: claims.length });
        return [];
      }
    });
    orders.push(...pages.flat());
  }
  return {
    regions: uniqueRegionIds,
    orders,
    saleAverages: [],
    failures: failures.slice(0, 50),
    partialError: failures.length ? `${failures.length} regional buy-order market request${failures.length === 1 ? "" : "s"} failed` : null,
  };
}

function regionalSaleAverageKey(order) {
  const regionId = String(order.regionId ?? "").trim();
  const itemId = String(order.itemId ?? "").trim();
  const itemType = String(order.itemType ?? 0).trim() || "0";
  return regionId && itemId ? `${regionId}:${itemType}:${itemId}` : "";
}

function currentMonitoredRegionId(claimId) {
  const id = String(claimId ?? "").trim();
  if (!id) return "";
  const rowsByDomain = readDomainPayloadMap(id);
  const claimPayload = rowsByDomain.claim?.data ?? {};
  const claimData = claimPayload.claim ?? claimPayload;
  const directRegionId = String(claimData.regionId ?? claimData.region_id ?? claimData.region ?? "").trim();
  if (/^\d+$/.test(directRegionId)) return directRegionId;
  const regionPayload = rowsByDomain.region?.data ?? {};
  const regionClaims = unwrap(regionPayload, "claims", []);
  const monitoredRegionClaim = regionClaims.find((claim) => String(claim.entityId ?? claim.id ?? claim.claimId ?? "") === id);
  const fallbackRegionId = String(monitoredRegionClaim?.regionId ?? monitoredRegionClaim?.region_id ?? "").trim();
  return /^\d+$/.test(fallbackRegionId) ? fallbackRegionId : "";
}

function priceHistoryBucketTotals(bucket) {
  const unitsSold = toNumber(bucket.quantity ?? bucket.unitsSold ?? bucket.volume ?? bucket.totalQuantity);
  const totalValue = toNumber(bucket.totalPrice ?? bucket.totalValue ?? bucket.value ?? bucket.revenue);
  const salesCount = toNumber(bucket.salesCount ?? bucket.tradeCount ?? bucket.trades ?? bucket.count) || unitsSold;
  return { unitsSold, totalValue, salesCount };
}

function marketPriceHistoryKind(itemType) {
  return toNumber(itemType) === 1 || String(itemType ?? "").toLowerCase() === "cargo" ? "cargo" : "items";
}

async function fetchRegionalBuyOrderSaleAverages(claimId, orders, failures = [], options = {}) {
  const now = Date.now();
  const staleBefore = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const useCache = options.useCache !== false;
  const progressKey = Object.hasOwn(options, "progressKey") ? options.progressKey : "buyOrders";
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const onAverage = typeof options.onAverage === "function" ? options.onAverage : null;
  const requestTimeoutMs = Math.max(1000, Math.min(toNumber(options.requestTimeoutMs ?? process.env.REGIONAL_SALE_BASELINE_REQUEST_TIMEOUT_MS) || 10000, 60000));
  const uniqueOrders = [...new Map(orders
    .filter((order) => regionalSaleAverageKey(order))
    .map((order) => [regionalSaleAverageKey(order), order])).values()];
  let completed = 0;
  const reportProgress = async (extra = {}) => {
    if (progressKey) collectorProgress(progressKey, "Calculating 7-day sales baselines", { current: completed, total: uniqueOrders.length });
    if (onProgress) await onProgress({ current: completed, total: uniqueOrders.length, ...extra });
  };
  const averages = await mapWithConcurrency(uniqueOrders, 3, async (order) => {
    const regionId = String(order.regionId ?? "").trim();
    const itemId = String(order.itemId ?? "").trim();
    const itemType = String(order.itemType ?? 0).trim() || "0";
    const currentItem = order.itemName ?? itemId;
    const cached = useCache ? db.prepare(`
      SELECT * FROM market_regional_sale_averages_current
      WHERE claim_id = ? AND region_id = ? AND item_id = ? AND item_type = ? AND updated_at >= ?
    `).get(String(claimId), regionId, itemId, itemType, staleBefore) : null;
    await reportProgress({ currentItem, currentRegionId: regionId, phase: "checking" });
    if (cached) {
      completed += 1;
      const average = {
        regionId,
        itemId,
        itemType,
        itemName: cached.item_name,
        averageUnitPrice: toNumber(cached.average_unit_price),
        salesCount: toNumber(cached.sales_count),
        unitsSold: toNumber(cached.units_sold),
        totalValue: toNumber(cached.total_value),
        windowDays: toNumber(cached.window_days) || 7,
        firstBucketAt: cached.first_bucket_at,
        lastBucketAt: cached.last_bucket_at,
        raw: safeJson(cached.raw_json, {}),
      };
      if (onAverage) await onAverage(average, { current: completed, total: uniqueOrders.length });
      await reportProgress({ currentItem, currentRegionId: regionId, phase: "cached" });
      return average;
    }
    try {
      await reportProgress({ currentItem, currentRegionId: regionId, phase: "fetching" });
      const historyKind = marketPriceHistoryKind(itemType);
      const payload = await fetchBitjita(`/market/${historyKind}/${encodeURIComponent(itemId)}/price-history?bucket=1%20day&limit=30&regionId=${encodeURIComponent(regionId)}`, { timeoutMs: requestTimeoutMs });
      const buckets = unwrap(payload, "buckets", []);
      const stats = payload?.priceStats && typeof payload.priceStats === "object" ? payload.priceStats : {};
      let salesCount = 0;
      let unitsSold = 0;
      let totalValue = 0;
      for (const bucket of buckets) {
        const totals = priceHistoryBucketTotals(bucket);
        salesCount += totals.salesCount;
        unitsSold += totals.unitsSold;
        totalValue += totals.totalValue;
      }
      const statsAverage = toNumber(stats.avg7d);
      const statsSalesCount = toNumber(stats.totalTrades ?? stats.salesCount ?? stats.tradeCount);
      const statsUnitsSold = toNumber(stats.totalVolume ?? stats.unitsSold ?? stats.volume ?? stats.totalQuantity);
      if (statsAverage > 0) {
        salesCount = statsSalesCount || salesCount;
        unitsSold = statsUnitsSold || unitsSold;
        totalValue = unitsSold > 0 ? statsAverage * unitsSold : totalValue;
      }
      completed += 1;
      if (salesCount <= 0 || (statsAverage <= 0 && (unitsSold <= 0 || totalValue <= 0))) {
        db.prepare(`
          DELETE FROM market_regional_sale_averages_current
          WHERE claim_id = ? AND region_id = ? AND item_id = ? AND item_type = ?
        `).run(String(claimId), regionId, itemId, itemType);
        await reportProgress({ currentItem, currentRegionId: regionId, phase: "no_sales" });
        return null;
      }
      const average = {
        regionId,
        itemId,
        itemType,
        itemName: order.itemName ?? null,
        averageUnitPrice: statsAverage > 0 ? statsAverage : unitsSold > 0 ? totalValue / unitsSold : 0,
        salesCount,
        unitsSold,
        totalValue,
        windowDays: 7,
        firstBucketAt: buckets[0]?.bucket ?? buckets[0]?.date ?? buckets[0]?.start ?? null,
        lastBucketAt: buckets.at(-1)?.bucket ?? buckets.at(-1)?.date ?? buckets.at(-1)?.start ?? null,
        raw: {
          priceStats: stats,
          bucketCount: buckets.length,
          source: statsAverage > 0 ? "priceStats.avg7d" : "bucketTotals",
        },
      };
      if (onAverage) await onAverage(average, { current: completed, total: uniqueOrders.length });
      await reportProgress({ currentItem, currentRegionId: regionId, phase: "saved" });
      return average;
    } catch (error) {
      failures.push(`R${regionId} ${order.itemName ?? itemId} sales history: ${error instanceof Error ? error.message : String(error)}`);
      completed += 1;
      await reportProgress({ currentItem, currentRegionId: regionId, phase: "failed", lastFailure: failures.at(-1) });
      return null;
    }
  });
  return averages.filter(Boolean);
}

async function runRegionalBuyOrderSaleBaselineRefreshJob({ jobKey } = {}) {
  const claimId = String(getSettings().claimId ?? "").trim();
  if (!claimId) return { refreshed: false, reason: "No claim ID configured", orderCount: 0, averageCount: 0 };
  const regionId = currentMonitoredRegionId(claimId);
  if (!regionId) return { refreshed: false, reason: "No monitored region is known yet", orderCount: 0, averageCount: 0 };
  const cleanupAt = new Date().toISOString();
  db.prepare("UPDATE market_buy_orders_current SET active = 0, updated_at = ? WHERE claim_id = ? AND region_id <> ?").run(cleanupAt, claimId, regionId);
  db.prepare("DELETE FROM market_regional_sale_averages_current WHERE claim_id = ? AND region_id <> ?").run(claimId, regionId);
  db.prepare(`
    DELETE FROM market_regional_sale_averages_current
    WHERE claim_id = ? AND region_id = ?
      AND (
        average_unit_price <= 0 OR sales_count <= 0 OR units_sold <= 0 OR total_value <= 0
        OR raw_json LIKE '%"buckets":[]%'
      )
  `).run(claimId, regionId);
  const rows = db.prepare(`
    SELECT *
    FROM market_buy_orders_current
    WHERE claim_id = ? AND active = 1 AND region_id = ?
    ORDER BY region_id ASC, item_name ASC
  `).all(claimId, regionId);
  const orders = rows.map((row) => ({
    orderKey: row.order_key,
    regionId: row.region_id,
    itemId: row.item_id,
    itemType: row.item_type,
    itemName: row.item_name,
  }));
  if (!orders.length) return { refreshed: true, orderCount: 0, averageCount: 0, failures: [] };
  const failures = [];
  let written = 0;
  const uniqueItemCount = [...new Set(orders.map((order) => regionalSaleAverageKey(order)).filter(Boolean))].length;
  const progressBase = {
    orderCount: orders.length,
    uniqueItemCount,
    regionId,
    averageCount: 0,
    failureCount: 0,
    stage: "fetching_sale_baselines",
  };
  updateScheduledJobProgress(jobKey, { ...progressBase, current: 0, total: uniqueItemCount });
  await fetchRegionalBuyOrderSaleAverages(claimId, orders, failures, {
    useCache: false,
    progressKey: null,
    onAverage: async (average) => {
      const refreshedAt = new Date().toISOString();
      db.exec("BEGIN");
      try {
        written += persistRegionalSaleAverages(claimId, [average], refreshedAt);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      updateScheduledJobProgress(jobKey, {
        ...progressBase,
        averageCount: written,
        failureCount: failures.length,
      });
    },
    onProgress: async ({ current, total }) => {
      updateScheduledJobProgress(jobKey, {
        ...progressBase,
        current,
        total,
        averageCount: written,
        failureCount: failures.length,
      });
    },
  });
  return {
    refreshed: true,
    orderCount: orders.length,
    uniqueItemCount,
    averageCount: written,
    failureCount: failures.length,
    failures: failures.slice(0, 20),
  };
}

function marketTradeBackfillKey(claimId, playerId) {
  return `market_trade_backfill:${claimId}:${playerId}`;
}

function collectorResumeSettingKey(jobKey, claimId) {
  return `collector_resume:${jobKey}:${claimId}`;
}

function readCollectorResume(jobKey, claimId) {
  return safeJson(statements.getSetting.get(collectorResumeSettingKey(jobKey, claimId))?.value, {});
}

function writeCollectorResume(jobKey, claimId, metadata = {}) {
  const updatedAt = new Date().toISOString();
  statements.upsertSetting.run(collectorResumeSettingKey(jobKey, claimId), JSON.stringify({ ...metadata, updatedAt }), updatedAt);
}

async function fetchOrderTrades(playerId, orderEntityId) {
  const trades = [];
  let offset = 0;
  while (true) {
    const payload = await fetchBitjita(`/market/player/${playerId}/trades?type=sell&limit=200&offset=${offset}&orderEntityId=${encodeURIComponent(String(orderEntityId))}`, { cache: false });
    const page = unwrap(payload, "trades", []);
    trades.push(...page);
    if (page.length < 200) break;
    offset += page.length;
  }
  return trades;
}

async function fetchMemberSettlementSellTrades(claimId, member) {
  const playerId = String(member.playerEntityId ?? member.entityId ?? "").trim();
  if (!playerId) return null;
  const key = marketTradeBackfillKey(claimId, playerId);
  const isBackfilled = statements.getSetting.get(key)?.value === "complete";
  const claimOrders = [];
  let offset = 0;
  while (true) {
    const payload = await fetchBitjita(`/market/player/${playerId}/history?type=sell&status=COMPLETED&limit=200&offset=${offset}`, { cache: false });
    const page = unwrap(payload, "sellOrderHistory", []);
    claimOrders.push(...page.filter((order) => String(order.claimEntityId ?? "") === String(claimId)));
    if (isBackfilled || page.length < 200 || offset + page.length >= toNumber(payload.totalSellOrders)) break;
    offset += page.length;
  }
  const tradePages = await mapWithConcurrency(claimOrders, 3, (order) => fetchOrderTrades(playerId, order.entityId));
  return { key, member, trades: tradePages.flat(), isBackfilled };
}

function tradeOccurredAt(trade, importedAt) {
  const parsed = new Date(String(trade.createdAt ?? ""));
  return Number.isNaN(parsed.getTime()) ? importedAt : parsed.toISOString();
}

function shouldNotifyImportedMarketTrade(importResult, trade, importedAt) {
  if (importResult?.isBackfilled) return true;
  const occurredMs = new Date(tradeOccurredAt(trade, importedAt)).getTime();
  const importedMs = new Date(importedAt).getTime();
  if (!Number.isFinite(occurredMs) || !Number.isFinite(importedMs)) return false;
  return importedMs - occurredMs <= marketTradeNotificationRecoveryWindowMs;
}

function memberTradeImportKey(member) {
  return String(member.playerEntityId ?? member.entityId ?? "").trim();
}

async function importMemberSellTrades(claimId, members, options = {}) {
  const budget = normalizeJobBudget(options.budget ?? {}, marketTradeJobBudget);
  const uniqueMembers = [...new Map(members
    .filter((member) => memberTradeImportKey(member))
    .map((member) => [memberTradeImportKey(member), member])).values()]
    .sort((a, b) => memberTradeImportKey(a).localeCompare(memberTradeImportKey(b)));
  const resume = readCollectorResume("marketTrades", claimId);
  const batch = selectResumeBatch(uniqueMembers, {
    cursor: resume.nextCursor,
    batchSize: budget.batchSize,
    getKey: memberTradeImportKey,
  });
  const startedAtMs = Date.now();
  const imports = [];
  const processedMembers = [];
  for (const member of batch.items) {
    if (!jobBudgetAllowsMore(startedAtMs, budget, processedMembers.length)) break;
    processedMembers.push(member);
    try {
      imports.push(await fetchMemberSettlementSellTrades(claimId, member));
    } catch (error) {
      console.warn(`BitCraft market trade import failed for ${member.userName ?? member.playerEntityId}: ${error instanceof Error ? error.message : String(error)}`);
      imports.push(null);
    }
  }
  const importedAt = new Date().toISOString();
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const result of imports.filter(Boolean)) {
      for (const trade of result.trades) {
        const listing = { owner: result.member.userName ?? result.member.username, ownerEntityId: result.member.playerEntityId ?? result.member.entityId };
        const changed = insertConfirmedMarketTrade(claimId, trade, listing, importedAt);
        inserted += changed;
        if (changed > 0 && shouldNotifyImportedMarketTrade(result, trade, importedAt)) {
          const quantity = toNumber(trade.quantity);
          const unitPrice = toNumber(trade.unitPrice ?? trade.price);
          const occurredAt = tradeOccurredAt(trade, importedAt);
          const itemName = String(trade.itemName ?? "Unknown item");
          const metadata = {
            itemName,
            itemId: trade.itemId == null ? null : String(trade.itemId),
            itemType: trade.itemType == null ? null : String(trade.itemType),
            owner: trade.sellerUsername ?? listing.owner,
            ownerEntityId: trade.sellerEntityId == null ? listing.ownerEntityId : String(trade.sellerEntityId),
            sellerName: trade.sellerUsername ?? listing.owner,
            sellerEntityId: trade.sellerEntityId == null ? listing.ownerEntityId : String(trade.sellerEntityId),
            purchaserName: trade.purchaserUsername ?? null,
            purchaserEntityId: trade.purchaserEntityId == null ? null : String(trade.purchaserEntityId),
            quantity,
            price: unitPrice,
            unitPrice,
            totalValue: toNumber(trade.totalPrice ?? trade.total_price) || quantity * unitPrice,
            tradeId: String(trade.id ?? ""),
            tier: trade.itemTier == null ? null : String(trade.itemTier),
            rarity: trade.itemRarityStr ?? null,
            raw: trade,
          };
          addActivity(
            claimId,
            "market_sale_confirmed",
            `Confirmed sale: ${itemName} x${quantity.toLocaleString()} at ${unitPrice.toLocaleString()}g`,
            occurredAt,
            metadata,
            `market_sale_confirmed:trade:${trade.id ?? ""}`,
          );
        }
      }
      statements.upsertSetting.run(result.key, "complete", importedAt);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const complete = batch.complete && processedMembers.length === batch.items.length;
  const nextCursor = complete ? null : (processedMembers.length ? memberTradeImportKey(processedMembers[processedMembers.length - 1]) : (resume.nextCursor ?? null));
  writeCollectorResume("marketTrades", claimId, {
    nextCursor,
    complete,
    processed: processedMembers.length,
    total: uniqueMembers.length,
    inserted,
    budget,
  });
  return {
    inserted,
    requested: uniqueMembers.length,
    processed: processedMembers.length,
    complete,
    nextCursor,
  };
}
async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
}

function storageActivityBuildingKey(building) {
  return String(building.entityId ?? "").trim();
}

async function collectStorageActivity(claimId, inventories, options = {}) {
  const budget = normalizeJobBudget(options.budget ?? {}, storageActivityJobBudget);
  const buildings = unwrap(inventories, "buildings", [])
    .filter((building) => building.entityId && !isDeployableStorage(building))
    .sort((a, b) => storageActivityBuildingKey(a).localeCompare(storageActivityBuildingKey(b)));
  const resume = readCollectorResume("storageActivity", claimId);
  const batch = selectResumeBatch(buildings, {
    cursor: resume.nextCursor,
    batchSize: budget.batchSize,
    getKey: storageActivityBuildingKey,
  });
  const startedAtMs = Date.now();
  const failures = [];
  const responses = [];
  const processedBuildings = [];
  for (const building of batch.items) {
    if (!jobBudgetAllowsMore(startedAtMs, budget, processedBuildings.length)) break;
    processedBuildings.push(building);
    try {
      responses.push({ building, payload: await fetchBitjita(`/logs/storage?buildingEntityId=${building.entityId}&limit=40`) });
    } catch (error) {
      failures.push(`${storageContainerName(building)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  let inserted = 0;
  db.exec("BEGIN");
  try {
    for (const result of responses) {
      const items = [...(result.payload.items ?? []), ...(result.payload.cargos ?? [])];
      const catalog = new Map(items.map((item) => [String(item.id), item]));
      const containerName = storageContainerName(result.building);
      for (const log of result.payload.logs ?? []) {
        const event = log.data ?? {};
        const eventAction = String(event.type ?? "storage").replaceAll("_", " ").toLowerCase();
        const action = eventAction.includes("withdraw") ? "withdrew" : eventAction.includes("deposit") ? "deposited" : eventAction;
        const item = catalog.get(String(event.item_id));
        const actorName = String(log.subjectName ?? "Member");
        const summary = `${actorName} ${action} ${toNumber(event.quantity).toLocaleString()} ${item?.name ?? `item #${event.item_id ?? "?"}`} ${action === "withdrew" ? "from" : "to"} ${containerName}`;
        const metadata = {
          actorName,
          containerName,
          buildingId: String(result.building.entityId),
          itemName: item?.name ?? null,
          quantity: toNumber(event.quantity),
        };
        inserted += Number(statements.insertSourcedActivity.run(
          claimId,
          "storage",
          summary,
          log.timestamp ?? new Date().toISOString(),
          JSON.stringify(metadata),
          `storage:${result.building.entityId}:${log.id ?? `${log.timestamp}:${event.type}:${event.item_id}:${event.quantity}:${actorName}`}`,
        ).changes);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  const complete = batch.complete && processedBuildings.length === batch.items.length;
  const nextCursor = complete ? null : (processedBuildings.length ? storageActivityBuildingKey(processedBuildings[processedBuildings.length - 1]) : (resume.nextCursor ?? null));
  writeCollectorResume("storageActivity", claimId, {
    nextCursor,
    complete,
    processed: processedBuildings.length,
    total: buildings.length,
    inserted,
    failures: failures.slice(0, 20),
    budget,
  });
  return {
    requested: buildings.length,
    processed: processedBuildings.length,
    inserted,
    complete,
    nextCursor,
    failures,
  };
}
async function fetchCachedClaimDetail(claimId) {
  const cached = claimDetailCache.get(String(claimId));
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchBitjita(`/claims/${claimId}`);
  claimDetailCache.set(String(claimId), { value, expiresAt: Date.now() + 10 * 60 * 1000 });
  return value;
}

async function fetchCachedPlayerDetail(playerId) {
  const key = String(playerId);
  const cached = playerDetailCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const payload = await fetchBitjita(`/players/${encodeURIComponent(key)}`);
  const value = payload.player ?? payload;
  playerDetailCache.set(key, { value, expiresAt: Date.now() + 60 * 1000 });
  return value;
}

function fallbackPlayerFromMember(member, error) {
  const playerId = String(member?.playerEntityId ?? member?.entityId ?? member?.playerId ?? "").trim();
  return {
    entityId: playerId,
    playerEntityId: playerId,
    username: member?.userName ?? member?.username ?? member?.playerUsername ?? member?.name ?? playerId,
    userName: member?.userName ?? member?.username ?? member?.playerUsername ?? member?.name ?? playerId,
    signedIn: false,
    detailAvailable: false,
    detailError: error instanceof Error ? error.message : String(error ?? "Player detail unavailable"),
  };
}

async function fetchCachedCraftContributions(craftId) {
  const key = String(craftId);
  const cached = craftContributionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const payload = await fetchBitjita(`/crafts/${encodeURIComponent(key)}/contributions`);
  const value = payload.contributions ?? [];
  craftContributionCache.set(key, { value, expiresAt: Date.now() + 15 * 1000 });
  return value;
}

async function fetchAllRegionClaims(regionId) {
  const base = `/claims?regionId=${encodeURIComponent(regionId)}&limit=100&sort=supplies&order=desc`;
  const first = await fetchBitjita(`${base}&page=1`);
  const totalPages = Math.max(Math.ceil(toNumber(first.count) / 100), 1);
  const pages = totalPages > 1
    ? await mapWithConcurrency(Array.from({ length: totalPages - 1 }, (_, index) => index + 2), 4, (page) => fetchBitjita(`${base}&page=${page}`))
    : [];
  const claims = [first, ...pages].flatMap((page) => unwrap(page, "claims", []));
  const details = await mapWithConcurrency(claims, 8, async (claim) => {
    try {
      return await fetchCachedClaimDetail(claim.entityId);
    } catch {
      return null;
    }
  });
  return {
    ...first,
    claims: claims.map((claim, index) => {
      const detail = details[index];
      return detail ? { ...claim, ...(detail.claim ?? detail) } : claim;
    }),
  };
}

async function fetchCachedRegionClaims(regionId) {
  const key = String(regionId);
  const cached = regionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await fetchAllRegionClaims(key);
  regionCache.set(key, { expiresAt: Date.now() + 10 * 60 * 1000, value });
  return value;
}


function normalizeRegionRow(row, source = "bitjita") {
  const regionId = String(row?.regionId ?? row?.id ?? "").trim();
  if (!/^\d+$/.test(regionId)) return null;
  return {
    regionId,
    regionName: String(row?.regionName ?? row?.name ?? `Region ${regionId}`),
    active: row?.active !== false,
    syncing: row?.syncing === true,
    signedInPlayers: toNumber(row?.signedInPlayers ?? row?.playersOnline ?? row?.onlinePlayers),
    playersInQueue: toNumber(row?.playersInQueue ?? row?.queuedPlayers),
    updatedAt: row?.updatedAt ?? null,
    source,
  };
}

function claimRegionIdFromKnownData(claim, regionStatusPayload, previousRegionPayload, claimId) {
  const directRegionId = String(claim?.regionId ?? claim?.region_id ?? claim?.region ?? "").trim();
  if (/^\d+$/.test(directRegionId)) return directRegionId;
  const claimRegionName = String(claim?.regionName ?? claim?.region_name ?? "").trim().toLowerCase();
  if (claimRegionName) {
    for (const region of unwrap(regionStatusPayload, "regions", [])) {
      const regionName = String(region?.regionName ?? region?.name ?? "").trim().toLowerCase();
      const regionId = String(region?.regionId ?? region?.id ?? region?.entityId ?? "").trim();
      if (regionName && regionName === claimRegionName && /^\d+$/.test(regionId)) return regionId;
    }
  }
  for (const regionClaim of unwrap(previousRegionPayload, "claims", [])) {
    const regionClaimId = String(regionClaim?.entityId ?? regionClaim?.id ?? regionClaim?.claimId ?? "").trim();
    const regionId = String(regionClaim?.regionId ?? regionClaim?.region_id ?? "").trim();
    if (regionClaimId === String(claimId ?? "") && /^\d+$/.test(regionId)) return regionId;
  }
  return "";
}

async function fetchCachedActiveRegions(extraRegionIds = []) {
  const settings = getSettings();
  const overrideIds = parseRegionIds(settings.additionalActiveRegions);
  const includeIds = parseRegionIds(extraRegionIds.join(","));
  const cacheKey = [...overrideIds, ...includeIds].sort((a, b) => toNumber(a) - toNumber(b)).join(",");
  if (activeRegionsCache && activeRegionsCache.key === cacheKey && activeRegionsCache.expiresAt > Date.now()) return activeRegionsCache.value;
  const [statusPayload, regionsPayload] = await Promise.all([
    fetchBitjita("/regions/status").catch(() => ({ regions: [] })),
    fetchBitjita("/regions").catch(() => []),
  ]);
  const byId = new Map();
  for (const row of unwrap(statusPayload, "regions", [])) {
    const normalized = normalizeRegionRow(row, "status");
    if (normalized) byId.set(normalized.regionId, normalized);
  }
  for (const row of unwrap(regionsPayload, "regions", Array.isArray(regionsPayload) ? regionsPayload : [])) {
    const normalized = normalizeRegionRow(row, "regions");
    if (!normalized) continue;
    byId.set(normalized.regionId, { ...normalized, ...byId.get(normalized.regionId), regionName: byId.get(normalized.regionId)?.regionName ?? normalized.regionName });
  }
  for (const regionId of [...overrideIds, ...includeIds]) {
    byId.set(regionId, {
      regionId,
      regionName: byId.get(regionId)?.regionName ?? `Region ${regionId}`,
      active: true,
      syncing: byId.get(regionId)?.syncing ?? false,
      signedInPlayers: byId.get(regionId)?.signedInPlayers ?? 0,
      playersInQueue: byId.get(regionId)?.playersInQueue ?? 0,
      updatedAt: byId.get(regionId)?.updatedAt ?? null,
      source: byId.has(regionId) ? byId.get(regionId).source : "admin",
    });
  }
  const value = {
    regions: [...byId.values()]
      .filter((region) => region.active !== false)
      .sort((a, b) => toNumber(a.regionId) - toNumber(b.regionId)),
    overrideRegionIds: overrideIds,
    updatedAt: new Date().toISOString(),
  };
  activeRegionsCache = { key: cacheKey, expiresAt: Date.now() + 5 * 60 * 1000, value };
  return value;
}

async function fetchMapCatalog() {
  if (mapCatalogCache && mapCatalogCache.expiresAt > Date.now()) return mapCatalogCache.value;
  const [resources, creatures] = await Promise.all([
    fetchBitjita("/resources"),
    fetchBitjita("/creatures"),
  ]);
  const value = { resources: unwrap(resources, "resources", []), creatures: unwrap(creatures, "creatures", []) };
  mapCatalogCache = { expiresAt: Date.now() + 10 * 60 * 1000, value };
  return value;
}

function passiveCraftTimestamp(value) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function summarizePassiveCrafts(payload) {
  const catalog = new Map(
    [...(payload?.items ?? []), ...(payload?.cargos ?? [])].map((item) => [String(item.id), item]),
  );
  const summaries = new Map();
  for (const craft of payload?.craftResults ?? []) {
    const output = craft.craftedItem?.[0] ?? {};
    const item = catalog.get(String(output.item_id)) ?? {};
    const outputName = item.name ?? "crafted item";
    const recipe = String(craft.recipeName ?? "Craft {0}")
      .replace(/\s*\{\d+\}/g, ` ${outputName}`)
      .replace(/\s+/g, " ")
      .trim();
    const key = [recipe, craft.buildingName, craft.status, item.id ?? output.item_id].join("|");
    const current = summaries.get(key);
    const timestamp = passiveCraftTimestamp(craft.timestamp);
    if (current) {
      current.quantity += toNumber(output.quantity) || 1;
      if (timestamp > current.sortTimestamp) {
        current.timestamp = craft.timestamp;
        current.sortTimestamp = timestamp;
      }
      continue;
    }
    summaries.set(key, {
      recipe,
      status: craft.status ?? "unknown",
      structure: craft.buildingName ?? "Unknown structure",
      timestamp: craft.timestamp,
      sortTimestamp: timestamp,
      quantity: toNumber(output.quantity) || 1,
      tier: item.tier,
    });
  }
  return Array.from(summaries.values()).sort((a, b) => b.sortTimestamp - a.sortTimestamp).slice(0, 8);
}

async function fetchCachedPassiveCrafts(member) {
  const playerId = String(member.playerEntityId ?? member.entityId ?? "").trim();
  if (!playerId) return { ok: false, error: "Missing player id" };
  const cached = passiveCraftsCache.get(playerId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const payload = await fetchBitjita(`/players/${encodeURIComponent(playerId)}/passive-crafts?status=all`);
  const value = {
    ok: true,
    playerId,
    memberName: member.userName ?? member.username ?? member.name ?? "Unknown member",
    rows: summarizePassiveCrafts(payload),
  };
  passiveCraftsCache.set(playerId, { value, expiresAt: Date.now() + 60 * 1000 });
  return value;
}

function withServerFreshness(value, cacheState, cachedAt, stale = false) {
  const serverFreshness = { ...(value?.serverFreshness ?? {}), cacheState, cachedAt };
  if (stale) serverFreshness.stale = true;
  return { ...value, ...(stale ? { stale: true } : {}), serverFreshness };
}

async function loadHelperCached(cache, inflight, key, ttlMs, loader, options = {}) {
  const now = Date.now();
  const cached = cache.get(key);
  if (!options.forceRefresh && cached && cached.expiresAt > now) return withServerFreshness(cached.value, "hit", cached.cachedAt);
  const pending = !options.forceRefresh ? inflight.get(key) : null;
  if (pending) {
    const entry = await pending;
    return withServerFreshness(entry.value, entry.stale ? "stale-if-error" : "deduped", entry.cachedAt, entry.stale);
  }
  const stale = !options.forceRefresh && cached && (cached.staleExpiresAt ?? cached.expiresAt) > now ? cached : null;
  const request = (async () => {
    try {
      const value = await loader();
      const cachedAt = new Date().toISOString();
      const entry = {
        value,
        cachedAt,
        expiresAt: Date.now() + ttlMs,
        staleExpiresAt: Date.now() + ttlMs + LOCAL_HELPER_STALE_IF_ERROR_MS,
      };
      cache.set(key, entry);
      return entry;
    } catch (error) {
      if (stale) {
        const partialErrors = Array.isArray(stale.value?.partialErrors) ? stale.value.partialErrors : [];
        return {
          ...stale,
          stale: true,
          value: { ...stale.value, partialErrors: [...partialErrors, `Refresh failed: ${errorMessage(error)}`] },
        };
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, request);
  const entry = await request;
  return withServerFreshness(entry.value, entry.stale ? "stale-if-error" : "miss", entry.cachedAt, entry.stale);
}

function uniqueSummaryMembers(body, maxMembers) {
  const members = Array.isArray(body?.members) ? body.members : [];
  return [...new Map(members
    .filter((member) => member && (member.playerEntityId ?? member.entityId))
    .slice(0, maxMembers)
    .map((member) => [String(member.playerEntityId ?? member.entityId), member])).values()];
}

function summaryMemberCacheKey(members) {
  return members.map((member) => String(member.playerEntityId ?? member.entityId ?? "")).filter(Boolean).sort().join(",") || "empty";
}

async function passiveCraftSummaries(body) {
  const uniqueMembers = uniqueSummaryMembers(body, 50);
  const cacheKey = summaryMemberCacheKey(uniqueMembers);
  return loadHelperCached(passiveCraftSummariesCache, passiveCraftSummariesInflight, cacheKey, PASSIVE_CRAFT_SUMMARY_CACHE_TTL_MS, async () => {
    const results = await mapWithConcurrency(uniqueMembers, 4, async (member) => {
      try {
        return await fetchCachedPassiveCrafts(member);
      } catch (error) {
        return {
          ok: false,
          playerId: String(member.playerEntityId ?? member.entityId ?? ""),
          memberName: member.userName ?? member.username ?? member.name ?? "Unknown member",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    const rows = results
      .flatMap((result) => result.ok ? result.rows.map((row) => ({ ...row, playerId: result.playerId, memberName: result.memberName })) : [])
      .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
      .slice(0, 18);
    return {
      rows,
      requested: uniqueMembers.length,
      failed: results.filter((result) => !result.ok).length,
    };
  });
}

async function playerDetailSummaries(body) {
  const uniqueMembers = uniqueSummaryMembers(body, 100);
  const cacheKey = summaryMemberCacheKey(uniqueMembers);
  return loadHelperCached(playerDetailSummariesCache, playerDetailSummariesInflight, cacheKey, PLAYER_DETAIL_SUMMARY_CACHE_TTL_MS, async () => {
    const results = await mapWithConcurrency(uniqueMembers, 6, async (member) => {
      const playerId = String(member.playerEntityId ?? member.entityId ?? "");
      try {
        const player = await fetchCachedPlayerDetail(playerId);
        return { ok: true, player: { ...player, detailAvailable: true } };
      } catch (error) {
        return { ok: false, playerId, player: fallbackPlayerFromMember(member, error), error: error instanceof Error ? error.message : String(error) };
      }
    });
    return {
      players: results.map((result) => result.player),
      requested: uniqueMembers.length,
      failed: results.filter((result) => !result.ok).length,
      failures: results.filter((result) => !result.ok).map((result) => ({ playerId: result.playerId, error: result.error })).slice(0, 20),
    };
  });
}
function itemCatalogKey(item) {
  const id = item?.id ?? item?.entityId ?? item?.itemId;
  return id == null ? "" : String(id);
}

function mergeCraftCatalogs(payloads) {
  const items = new Map();
  const cargos = new Map();
  const claims = new Map();
  for (const payload of payloads) {
    for (const item of unwrap(payload, "items", [])) {
      const key = itemCatalogKey(item);
      if (key) items.set(key, item);
    }
    for (const cargo of unwrap(payload, "cargos", [])) {
      const key = itemCatalogKey(cargo);
      if (key) cargos.set(key, cargo);
    }
    for (const claim of unwrap(payload, "claims", [])) {
      const key = itemCatalogKey(claim);
      if (key) claims.set(key, claim);
    }
  }
  return {
    items: [...items.values()],
    cargos: [...cargos.values()],
    claims: [...claims.values()],
  };
}

function craftClaimId(craft) {
  return String(craft?.claimEntityId ?? craft?.claim_entity_id ?? craft?.claim?.entityId ?? craft?.claimId ?? "");
}

function productionCraftCacheKey(claimId, members) {
  const ids = members.map((member) => String(member.playerEntityId ?? member.entityId ?? "")).filter(Boolean).sort();
  return `${claimId}:${ids.join(",")}`;
}

async function settlementProductionCrafts(body) {
  const claimId = String(body?.claimId ?? "").trim();
  if (!claimId) return withServerFreshness({ craftResults: [], items: [], cargos: [], claims: [], count: 0, publicCount: 0, privateCount: 0, failedMemberRequests: 0 }, "miss", new Date().toISOString());
  const uniqueMembers = uniqueSummaryMembers(body, 50);
  const cacheKey = productionCraftCacheKey(claimId, uniqueMembers);
  return loadHelperCached(productionCraftsCache, productionCraftsInflight, cacheKey, PRODUCTION_CRAFT_CACHE_TTL_MS, async () => {
    let publicFetchError = "";
    const publicPayload = await fetchBitjita(`/crafts?claimEntityId=${encodeURIComponent(claimId)}&completed=false`, { timeoutMs: PRODUCTION_CRAFT_TIMEOUT_MS, cache: body?.forceRefresh !== true }).catch((error) => {
      publicFetchError = error instanceof Error ? error.message : String(error);
      return { craftResults: [] };
    });
    const publicCrafts = unwrap(publicPayload, "craftResults", []);
    const publicIds = new Set(publicCrafts.map((craft) => String(craft.entityId ?? "")).filter(Boolean));
    const memberResults = await mapWithConcurrency(uniqueMembers, 8, async (member) => {
      const playerId = String(member.playerEntityId ?? member.entityId ?? "");
      try {
        return { ok: true, payload: await fetchBitjita(`/players/${encodeURIComponent(playerId)}/crafts?completed=false`, { timeoutMs: PRODUCTION_MEMBER_CRAFT_TIMEOUT_MS, cache: body?.forceRefresh !== true }) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    const memberPayloads = memberResults.filter((result) => result.ok).map((result) => result.payload);
    const merged = new Map();

    for (const craft of publicCrafts) {
      if (!craft?.entityId || craftClaimId(craft) !== claimId) continue;
      merged.set(String(craft.entityId), { ...craft, isPublic: craft.isPublic !== false, visibilitySource: "claim-public" });
    }

    for (const payload of memberPayloads) {
      for (const craft of unwrap(payload, "craftResults", [])) {
        if (!craft?.entityId || craftClaimId(craft) !== claimId) continue;
        const id = String(craft.entityId);
        const existing = merged.get(id) ?? {};
        const isPublic = craft.isPublic === false ? false : publicIds.has(id) || craft.isPublic === true;
        merged.set(id, {
          ...existing,
          ...craft,
          isPublic,
          visibilitySource: isPublic ? existing.visibilitySource ?? "player-public" : "player-private",
        });
      }
    }

    const catalog = mergeCraftCatalogs([publicPayload, ...memberPayloads]);
    const craftResults = [...merged.values()].sort((a, b) => toNumber(b.totalActionsRequired) - toNumber(a.totalActionsRequired));
    const partialErrors = [
      publicFetchError ? `Public craft refresh failed: ${publicFetchError}` : "",
      ...memberResults.filter((result) => !result.ok).map((result) => `Member craft refresh failed: ${result.error}`),
    ].filter(Boolean);
    if (publicFetchError && !memberPayloads.length) {
      throw new Error(`Production refresh failed: ${publicFetchError}`);
    }
    return {
      craftResults,
      ...catalog,
      count: craftResults.length,
      publicCount: craftResults.filter((craft) => craft.isPublic !== false).length,
      privateCount: craftResults.filter((craft) => craft.isPublic === false).length,
      failedMemberRequests: memberResults.filter((result) => !result.ok).length,
      partialError: partialErrors[0] ?? null,
      partialErrors,
    };
  }, { forceRefresh: body?.forceRefresh === true });
}
function storedDashboardDataFallback(claimId, error) {
  const rowsByDomain = readDomainPayloadMap(claimId);
  if (!Object.keys(rowsByDomain).length) return null;
  const value = domainRowsToAppData(claimId, rowsByDomain);
  const message = error instanceof Error ? error.message : String(error);
  const partialErrors = Array.isArray(value.partialErrors) ? value.partialErrors : [];
  return {
    ...value,
    stale: true,
    partialErrors: [...new Set([...partialErrors, `Dashboard refresh failed: ${message}`])],
    serverFreshness: {
      ...(value.serverFreshness ?? {}),
      cacheState: "stored-stale-if-error",
      cachedAt: value.serverFreshness?.lastSuccessAt ?? value.serverFreshness?.collectedAt ?? null,
      stale: true,
      lastError: message,
    },
  };
}
async function dashboardData(claimId, options = {}) {
  const id = String(claimId ?? "").trim();
  if (!/^\d{8,}$/.test(id)) {
    const error = new Error("Choose a valid BitCraft settlement ID");
    error.statusCode = 400;
    throw error;
  }
  const now = Date.now();
  const cached = dashboardDataCache.get(id);
  if (!options.forceRefresh && cached && cached.expiresAt > now) {
    return { ...cached.value, serverFreshness: { ...(cached.value.serverFreshness ?? {}), cacheState: "hit", cachedAt: cached.cachedAt } };
  }
  const inflight = dashboardDataInflight.get(id);
  if (!options.forceRefresh && inflight) return inflight;
  const stale = cached && (cached.staleExpiresAt ?? cached.expiresAt) > now ? cached : null;
  const request = (async () => {
    try {
      const value = await dashboardDataFresh(id);
      const cachedAt = new Date().toISOString();
      dashboardDataCache.set(id, {
        value,
        cachedAt,
        expiresAt: Date.now() + DASHBOARD_DATA_CACHE_TTL_MS,
        staleExpiresAt: Date.now() + DASHBOARD_DATA_CACHE_TTL_MS + DASHBOARD_DATA_STALE_IF_ERROR_MS,
      });
      return { ...value, serverFreshness: { ...(value.serverFreshness ?? {}), cacheState: "miss", cachedAt } };
    } catch (error) {
      if (stale) {
        const message = error instanceof Error ? error.message : String(error);
        const partialErrors = Array.isArray(stale.value.partialErrors) ? stale.value.partialErrors : [];
        return {
          ...stale.value,
          stale: true,
          partialErrors: [...partialErrors, `Dashboard refresh failed: ${message}`],
          serverFreshness: { ...(stale.value.serverFreshness ?? {}), cacheState: "stale-if-error", cachedAt: stale.cachedAt },
        };
      }
      const storedFallback = storedDashboardDataFallback(id, error);
      if (storedFallback) return storedFallback;
      throw error;
    } finally {
      dashboardDataInflight.delete(id);
    }
  })();
  dashboardDataInflight.set(id, request);
  return request;
}
async function dashboardDataFresh(claimId) {
  const id = String(claimId ?? "").trim();
  if (!/^\d{8,}$/.test(id)) {
    const error = new Error("Choose a valid BitCraft settlement ID");
    error.statusCode = 400;
    throw error;
  }
  const [claimPayload, membersPayload, citizensPayload, buildingsPayload, constructionPayload, researchPayload, marketPayload, craftsPayload, regionStatus] = await Promise.all([
    fetchBitjita(`/claims/${id}`),
    fetchBitjita(`/claims/${id}/members`),
    fetchBitjita(`/claims/${id}/citizens`).catch(() => ({ citizens: [] })),
    fetchBitjita(`/claims/${id}/buildings`),
    fetchBitjita(`/claims/${id}/construction`).catch(() => ({ projects: [] })),
    fetchBitjita(`/claims/${id}/research`).catch(() => ({ research: [] })),
    fetchAllClaimListings(id).catch(() => ({ listings: [] })),
    fetchBitjita(`/crafts?claimEntityId=${encodeURIComponent(id)}&completed=false`).catch(() => ({ craftResults: [] })),
    fetchBitjita("/regions/status").catch(() => ({ regions: [] })),
  ]);
  const claim = claimPayload.claim ?? claimPayload;
  const members = unwrap(membersPayload, "members", []);
  const crafts = unwrap(craftsPayload, "craftResults", []);
  const [playerPayload, contributionEntries, region, tradeVolume] = await Promise.all([
    playerDetailSummaries({ members }),
    mapWithConcurrency(crafts.filter((craft) => craft.entityId), 4, async (craft) => {
      try {
        return [String(craft.entityId), await fetchCachedCraftContributions(craft.entityId)];
      } catch {
        return [String(craft.entityId), []];
      }
    }),
    claim?.regionId ? fetchCachedRegionClaims(claim.regionId).catch(() => ({ claims: [] })) : Promise.resolve({ claims: [] }),
    claim?.regionId ? fetchBitjita(`/stats/trade-volume?bucket=1%20day&limit=30&regionId=${encodeURIComponent(String(claim.regionId))}`).catch(() => ({ buckets: [], items: [], regions: [] })) : Promise.resolve({ buckets: [], items: [], regions: [] }),
  ]);
  return {
    claim: claimPayload,
    members: membersPayload,
    citizens: citizensPayload,
    buildings: buildingsPayload,
    construction: constructionPayload,
    research: researchPayload,
    market: marketPayload,
    crafts: craftsPayload,
    players: playerPayload.players ?? [],
    playerDetailDiagnostics: {
      requested: playerPayload.requested ?? 0,
      failed: playerPayload.failed ?? 0,
      failures: playerPayload.failures ?? [],
    },
    contributions: Object.fromEntries(contributionEntries),
    region,
    regionStatus,
    tradeVolume,
  };
}

async function craftContributionMap(crafts) {
  const entries = await mapWithConcurrency(crafts.filter((craft) => craft?.entityId), 4, async (craft) => {
    try {
      return [String(craft.entityId), await fetchCachedCraftContributions(craft.entityId)];
    } catch {
      return [String(craft.entityId), []];
    }
  });
  return Object.fromEntries(entries);
}

function currentStateCounts(data) {
  return {
    members: unwrap(data.members, "members", []).length,
    citizens: unwrap(data.citizens, "citizens", []).length,
    crafts: unwrap(data.crafts, "craftResults", []).length,
    marketListings: unwrap(data.market, "listings", []).length,
    players: Array.isArray(data.players) ? data.players.length : 0,
  };
}

function domainPayloadFromData(data, domain) {
  if (domain === "players") return { players: Array.isArray(data.players) ? data.players : [] };
  if (domain === "playerDetailDiagnostics") return data.playerDetailDiagnostics ?? {};
  return data[domain] ?? {};
}

function readDomainPayloadMap(claimId) {
  // Domain payloads preserve the most recent background collection for history,
  // diagnostics, and notifications. They are not intended to replace live
  // page-driven BitJita reads for the main app.
  return Object.fromEntries(statements.domainPayloadsByClaim.all(String(claimId ?? "")).map((row) => [row.domain, {
    ...row,
    data: safeJson(row.data_json, {}),
  }]));
}

function rowData(row) {
  return safeJson(row?.data_json, {});
}

function domainRowsToAppData(claimId, rowsByDomain) {
  const payload = (domain, fallback) => rowsByDomain[domain]?.data ?? fallback;
  const partialErrors = Object.values(rowsByDomain)
    .flatMap((row) => {
      const data = row.data && typeof row.data === "object" ? row.data : {};
      return [...(Array.isArray(data.partialErrors) ? data.partialErrors : []), row.last_error].filter(Boolean);
    })
    .map((error) => String(error));
  const lastSuccessValues = Object.values(rowsByDomain).map((row) => row.last_success_at ?? row.collected_at).filter(Boolean);
  const lastAttemptValues = Object.values(rowsByDomain).map((row) => row.last_attempt_at).filter(Boolean);
  const lastSuccessAt = lastSuccessValues.sort().at(-1) ?? null;
  const lastAttemptAt = lastAttemptValues.sort().at(-1) ?? null;
  const lastError = Object.values(rowsByDomain).map((row) => row.last_error).filter(Boolean).at(-1) ?? null;
  const counts = currentStateCounts({
    members: payload("members", { members: [] }),
    citizens: payload("citizens", { citizens: [] }),
    crafts: payload("crafts", { craftResults: [] }),
    market: payload("market", { listings: [] }),
    players: unwrap(payload("players", { players: [] }), "players", []),
  });
  const dataAgeSeconds = lastSuccessAt ? Math.max(Math.round((Date.now() - new Date(lastSuccessAt).getTime()) / 1000), 0) : null;
  return {
    claim: payload("claim", {}),
    members: payload("members", { members: [] }),
    citizens: payload("citizens", { citizens: [] }),
    buildings: payload("buildings", { buildings: [] }),
    construction: payload("construction", { projects: [] }),
    research: payload("research", { research: [] }),
    market: payload("market", { listings: [] }),
    crafts: payload("crafts", { craftResults: [] }),
    players: unwrap(payload("players", { players: [] }), "players", []),
    playerDetailDiagnostics: payload("playerDetailDiagnostics", {}),
    contributions: payload("contributions", {}),
    region: payload("region", { claims: [] }),
    regionStatus: payload("regionStatus", { regions: [] }),
    tradeVolume: payload("tradeVolume", {}),
    regionalBuyOrders: payload("regionalBuyOrders", { regions: [], orders: [] }),
    inventories: payload("inventories", { buildings: [] }),
    recruitment: payload("recruitment", { applications: [] }),
    layout: payload("layout", {}),
    skills: payload("skills", {}),
    partialErrors: [...new Set(partialErrors)],
    serverFreshness: {
      claimId: String(claimId ?? ""),
      collectedAt: lastSuccessAt,
      lastAttemptAt,
      lastSuccessAt,
      lastError,
      dataAgeSeconds,
      stale: dataAgeSeconds != null ? dataAgeSeconds > serverRefreshIntervalMs() / 1000 * 2 : true,
      counts,
    },
    collectorStatus: collectorStatusPayload(),
  };
}

function meaningfulItemName(value) {
  const text = String(value ?? "").trim();
  if (!text || text.toLowerCase() === "unknown item") return null;
  return text;
}

function itemNameFromRow(row) {
  return String(
    meaningfulItemName(row?.itemName)
    ?? meaningfulItemName(row?.name)
    ?? meaningfulItemName(row?.item?.name)
    ?? meaningfulItemName(row?.cargo?.name)
    ?? meaningfulItemName(row?.cargoName)
    ?? meaningfulItemName(row?.tag)
    ?? meaningfulItemName(row?.item?.tag)
    ?? meaningfulItemName(row?.cargo?.tag)
    ?? "Unknown item"
  );
}

function itemIdFromRow(row) {
  return String(row?.itemId ?? row?.item_id ?? row?.id ?? row?.item?.id ?? row?.cargo?.id ?? "");
}

function itemQuantityFromRow(row) {
  return toNumber(row?.quantity ?? row?.amount ?? row?.count ?? row?.stackSize);
}

function inventoryStoredTotalsFromPayload(inventories) {
  const totals = new Map();
  for (const building of unwrap(inventories, "buildings", [])) {
    for (const slot of building.inventory ?? []) {
      const contents = slot.contents ?? {};
      const type = contents.item_type === "cargo" || contents.itemType === "cargo" || contents.itemType === 1 ? "cargo" : "item";
      const itemId = contents.item_id ?? contents.itemId;
      if (itemId == null) continue;
      const key = `${type}:${itemId}`;
      totals.set(key, (totals.get(key) ?? 0) + toNumber(contents.quantity));
    }
  }
  return totals;
}

function persistRegionalBuyOrdersCurrent(claimId, payload, collectedAt) {
  const claimIdText = String(claimId ?? "").trim();
  if (!claimIdText || !payload || typeof payload !== "object") return 0;
  const orders = Array.isArray(payload.orders) ? payload.orders : [];
  const regions = [...new Set([
    ...unwrap(payload, "regions", []),
    ...orders.map((order) => order.regionId),
  ].map((regionId) => String(regionId ?? "").trim()).filter((regionId) => /^\d+$/.test(regionId)))];
  const upsertBuyOrder = db.prepare(`
    INSERT INTO market_buy_orders_current (
      claim_id, order_key, region_id, region_name, market_claim_id, market_claim_name,
      buyer_entity_id, buyer_name, item_id, item_type, item_name, tier, rarity, icon_asset_name,
      quantity, unit_price, total_value, stored_coins, listed_at, first_seen, last_seen, active,
      raw_json, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(claim_id, order_key) DO UPDATE SET
      region_id = excluded.region_id,
      region_name = excluded.region_name,
      market_claim_id = excluded.market_claim_id,
      market_claim_name = excluded.market_claim_name,
      buyer_entity_id = excluded.buyer_entity_id,
      buyer_name = excluded.buyer_name,
      item_id = excluded.item_id,
      item_type = excluded.item_type,
      item_name = excluded.item_name,
      tier = excluded.tier,
      rarity = excluded.rarity,
      icon_asset_name = excluded.icon_asset_name,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      total_value = excluded.total_value,
      stored_coins = excluded.stored_coins,
      listed_at = excluded.listed_at,
      last_seen = excluded.last_seen,
      active = 1,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);
  let written = 0;
  for (const regionId of regions) {
    db.prepare("UPDATE market_buy_orders_current SET active = 0, updated_at = ? WHERE claim_id = ? AND region_id = ?").run(collectedAt, claimIdText, regionId);
  }
  for (const order of orders) {
    const orderKey = String(order.orderKey ?? "").trim();
    const regionId = String(order.regionId ?? "").trim();
    const itemName = String(order.itemName ?? "").trim();
    if (!orderKey || !regionId || !itemName) continue;
    const quantity = toNumber(order.quantity);
    const unitPrice = toNumber(order.unitPrice);
    upsertBuyOrder.run(
      claimIdText,
      orderKey,
      regionId,
      order.regionName ?? null,
      order.marketClaimId ?? null,
      order.marketClaimName ?? null,
      order.buyerEntityId ?? null,
      order.buyerName ?? null,
      order.itemId ?? null,
      order.itemType ?? "0",
      itemName,
      order.tier ?? null,
      order.rarity ?? null,
      order.iconAssetName ?? null,
      quantity,
      unitPrice,
      order.totalValue ?? quantity * unitPrice,
      toNumber(order.storedCoins),
      order.listedAt ?? null,
      order.firstSeen ?? collectedAt,
      collectedAt,
      JSON.stringify(order.raw ?? order),
      collectedAt,
    );
    written += 1;
  }
  return written;
}

function persistRegionalSaleAverages(claimId, averages, collectedAt) {
  const claimIdText = String(claimId ?? "").trim();
  const upsertRegionalSaleAverage = db.prepare(`
    INSERT INTO market_regional_sale_averages_current (
      claim_id, region_id, item_id, item_type, item_name, average_unit_price, sales_count,
      units_sold, total_value, window_days, first_bucket_at, last_bucket_at, raw_json, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(claim_id, region_id, item_id, item_type) DO UPDATE SET
      item_name = excluded.item_name,
      average_unit_price = excluded.average_unit_price,
      sales_count = excluded.sales_count,
      units_sold = excluded.units_sold,
      total_value = excluded.total_value,
      window_days = excluded.window_days,
      first_bucket_at = excluded.first_bucket_at,
      last_bucket_at = excluded.last_bucket_at,
      raw_json = excluded.raw_json,
      updated_at = excluded.updated_at
  `);
  let written = 0;
  for (const average of Array.isArray(averages) ? averages : []) {
    const regionId = String(average.regionId ?? "").trim();
    const itemId = String(average.itemId ?? "").trim();
    const itemType = String(average.itemType ?? 0).trim() || "0";
    if (!claimIdText || !regionId || !itemId) continue;
    upsertRegionalSaleAverage.run(
      claimIdText,
      regionId,
      itemId,
      itemType,
      average.itemName ?? null,
      toNumber(average.averageUnitPrice),
      toNumber(average.salesCount),
      toNumber(average.unitsSold),
      toNumber(average.totalValue),
      toNumber(average.windowDays) || 7,
      average.firstBucketAt ?? null,
      average.lastBucketAt ?? null,
      JSON.stringify(average.raw ?? average),
      collectedAt,
    );
    written += 1;
  }
  return written;
}

function persistDomainPayloads(claimId, data, attemptedAt, collectedAt, metrics = null) {
  const payloadWriteStartedAt = Date.now();
  for (const domain of domainPayloadKeys) {
    const domainStartedAt = Date.now();
    const payload = domainPayloadFromData(data, domain);
    const domainError = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.partialError : null;
    statements.upsertDomainPayload.run(String(claimId), domain, JSON.stringify(payload), collectedAt, attemptedAt, collectedAt, domainError ? String(domainError) : null, collectedAt);
    recordCollectorPayloadWrite(metrics, domain, Date.now() - domainStartedAt);
  }
  persistRegionalBuyOrdersCurrent(claimId, data?.regionalBuyOrders, collectedAt);
  if (metrics) metrics.domainPayloadWriteDurationMs = Math.max(Date.now() - payloadWriteStartedAt, 0);
}

function collectorDue(claimId, collectorKey, payloadDomain, options = {}) {
  if (options.force) return true;
  const settings = getCollectorSettings()[collectorKey] ?? { enabled: true, intervalSeconds: Math.round(serverRefreshIntervalMs() / 1000) };
  const row = statements.domainPayload.get(String(claimId ?? ""), payloadDomain);
  if (!row) return settings.enabled !== false;
  if (settings.enabled === false) return false;
  const lastSuccessAt = row.last_success_at ?? row.collected_at;
  if (!lastSuccessAt) return true;
  return Date.now() - new Date(lastSuccessAt).getTime() >= settings.intervalSeconds * 1000;
}

function previousPayload(previous, domain, fallback) {
  return previous[domain]?.data ?? fallback;
}

async function fetchDomainPayload(previous, domain, fallback, label, load) {
  try {
    return await load();
  } catch (error) {
    const fallbackPayload = previousPayload(previous, domain, fallback);
    const message = `${label} refresh failed: ${error instanceof Error ? error.message : String(error)}`;
    if (!fallbackPayload || typeof fallbackPayload !== "object" || Array.isArray(fallbackPayload)) {
      return { value: fallbackPayload, partialError: message, partialErrors: [message] };
    }
    return {
      ...fallbackPayload,
      partialError: message,
      partialErrors: [...(Array.isArray(fallbackPayload.partialErrors) ? fallbackPayload.partialErrors : []), message],
    };
  }
}

async function buildCurrentClaimData(claimId, options = {}) {
  const id = String(claimId ?? "").trim();
  if (!/^\d{8,}$/.test(id)) {
    const error = new Error("Choose a valid BitCraft settlement ID");
    error.statusCode = 400;
    throw error;
  }
  const metrics = options.metrics ?? null;
  const previous = readDomainPayloadMap(id);
  const claimPayload = collectorDue(id, "claim", "claim", options)
    ? await timedCollectorFetch(metrics, "claim", "claim", () => fetchBitjita(`/claims/${id}`))
    : previousPayload(previous, "claim", {});
  const claim = claimPayload.claim ?? claimPayload;
  const membersPayload = collectorDue(id, "members", "members", options)
    ? await timedCollectorFetch(metrics, "members", "members", () => fetchBitjita(`/claims/${id}/members`))
    : previousPayload(previous, "members", { members: [] });
  const members = unwrap(membersPayload, "members", []);

  const [
    citizensPayload,
    buildingsPayload,
    constructionPayload,
    researchPayload,
    marketPayload,
    productionPayload,
    playerPayload,
    inventoriesPayload,
    recruitmentPayload,
    layoutPayload,
    skillsPayload,
    regionStatus,
  ] = await Promise.all([
    collectorDue(id, "professions", "citizens", options) ? fetchDomainPayload(previous, "citizens", { citizens: [] }, "Citizens", () => timedCollectorFetch(metrics, "professions", "citizens", () => fetchBitjita(`/claims/${id}/citizens`))) : Promise.resolve(previousPayload(previous, "citizens", { citizens: [] })),
    collectorDue(id, "construction", "buildings", options) || collectorDue(id, "claim", "buildings", options) ? fetchDomainPayload(previous, "buildings", { buildings: [] }, "Buildings", () => timedCollectorFetch(metrics, "construction", "buildings", () => fetchBitjita(`/claims/${id}/buildings`))) : Promise.resolve(previousPayload(previous, "buildings", { buildings: [] })),
    collectorDue(id, "construction", "construction", options) ? fetchDomainPayload(previous, "construction", { projects: [] }, "Construction", () => timedCollectorFetch(metrics, "construction", "construction", () => fetchBitjita(`/claims/${id}/construction`))) : Promise.resolve(previousPayload(previous, "construction", { projects: [] })),
    collectorDue(id, "research", "research", options) ? fetchDomainPayload(previous, "research", { research: [] }, "Research", () => timedCollectorFetch(metrics, "research", "research", () => fetchBitjita(`/claims/${id}/research`))) : Promise.resolve(previousPayload(previous, "research", { research: [] })),
    collectorDue(id, "market", "market", options) ? fetchDomainPayload(previous, "market", { listings: [] }, "Market", () => timedCollectorFetch(metrics, "market", "market listings", () => fetchAllClaimListings(id, { cache: options.force !== true }))) : Promise.resolve(previousPayload(previous, "market", { listings: [] })),
    collectorDue(id, "production", "crafts", options)
      ? timedCollectorFetch(metrics, "production", "production crafts", () => settlementProductionCrafts({ claimId: id, members, forceRefresh: true })).catch((error) => {
        const fallback = previousPayload(previous, "crafts", { craftResults: [] });
        return { ...fallback, partialError: error instanceof Error ? error.message : String(error) };
      })
      : Promise.resolve(previousPayload(previous, "crafts", { craftResults: [] })),
    collectorDue(id, "players", "players", options) ? fetchDomainPayload(previous, "players", { players: [] }, "Player details", () => timedCollectorFetch(metrics, "players", "player details", () => playerDetailSummaries({ members }))) : Promise.resolve(previousPayload(previous, "players", { players: [] })),
    collectorDue(id, "inventory", "inventories", options) ? fetchDomainPayload(previous, "inventories", { buildings: [] }, "Inventories", () => timedCollectorFetch(metrics, "inventory", "inventories", () => fetchBitjita(`/claims/${id}/inventories`))) : Promise.resolve(previousPayload(previous, "inventories", { buildings: [] })),
    collectorDue(id, "inventory", "recruitment", options) ? fetchDomainPayload(previous, "recruitment", { applications: [] }, "Recruitment", () => timedCollectorFetch(metrics, "inventory", "recruitment", () => fetchBitjita(`/claims/${id}/recruitment`))) : Promise.resolve(previousPayload(previous, "recruitment", { applications: [] })),
    collectorDue(id, "inventory", "layout", options) ? fetchDomainPayload(previous, "layout", {}, "Layout", () => timedCollectorFetch(metrics, "inventory", "layout", () => fetchBitjita(`/claims/${id}/layout`))) : Promise.resolve(previousPayload(previous, "layout", {})),
    collectorDue(id, "mapCatalog", "skills", options) || collectorDue(id, "professions", "skills", options) ? fetchDomainPayload(previous, "skills", { skills: [] }, "Skills catalogue", () => timedCollectorFetch(metrics, collectorDue(id, "mapCatalog", "skills", options) ? "mapCatalog" : "professions", "skills catalogue", () => fetchBitjita("/skills"))) : Promise.resolve(previousPayload(previous, "skills", { skills: [] })),
    collectorDue(id, "region", "regionStatus", options) ? fetchDomainPayload(previous, "regionStatus", { regions: [] }, "Region status", () => timedCollectorFetch(metrics, "region", "region status", () => fetchBitjita("/regions/status"))) : Promise.resolve(previousPayload(previous, "regionStatus", { regions: [] })),
  ]);
  const productionCrafts = unwrap(productionPayload, "craftResults", []);
  const contributionEntries = collectorDue(id, "production", "contributions", options)
    ? Object.entries(await timedCollectorFetch(metrics, "production", "craft contributions", () => craftContributionMap(productionCrafts)))
    : Object.entries(previousPayload(previous, "contributions", {}));
  const derivedRegionId = claimRegionIdFromKnownData(claim, regionStatus, previousPayload(previous, "region", { claims: [] }), id);
  const claimPayloadWithRegion = derivedRegionId && !String(claim?.regionId ?? claim?.region_id ?? claim?.region ?? "").trim()
    ? (claimPayload?.claim
      ? { ...claimPayload, claim: { ...claimPayload.claim, regionId: derivedRegionId } }
      : { ...claimPayload, regionId: derivedRegionId })
    : claimPayload;
  const [region, tradeVolume] = await Promise.all([
    collectorDue(id, "region", "region", options) && derivedRegionId ? fetchDomainPayload(previous, "region", { claims: [] }, "Region claims", () => timedCollectorFetch(metrics, "region", "region claims", () => fetchCachedRegionClaims(derivedRegionId))) : Promise.resolve(previousPayload(previous, "region", { claims: [] })),
    collectorDue(id, "market", "tradeVolume", options) && derivedRegionId ? fetchDomainPayload(previous, "tradeVolume", { buckets: [], items: [], regions: [] }, "Trade volume", () => timedCollectorFetch(metrics, "market", "trade volume", () => fetchBitjita(`/stats/trade-volume?bucket=1%20day&limit=30&regionId=${encodeURIComponent(String(derivedRegionId))}`))) : Promise.resolve(previousPayload(previous, "tradeVolume", { buckets: [], items: [], regions: [] })),
  ]);
  const buyOrderRegionIds = [...new Set([
    derivedRegionId,
  ].map((regionId) => String(regionId ?? "").trim()).filter((regionId) => /^\d+$/.test(regionId)))];
  const regionalBuyOrders = collectorDue(id, "buyOrders", "regionalBuyOrders", options) && buyOrderRegionIds.length
    ? await fetchDomainPayload(previous, "regionalBuyOrders", { regions: [], orders: [] }, "Regional buy orders", () => timedCollectorFetch(metrics, "buyOrders", "regional buy orders", () => fetchRegionalBuyOrders(id, buyOrderRegionIds)))
    : previousPayload(previous, "regionalBuyOrders", { regions: [], orders: [] });
  const players = unwrap(playerPayload, "players", Array.isArray(playerPayload) ? playerPayload : []);
  return {
    claim: claimPayloadWithRegion,
    members: membersPayload,
    citizens: citizensPayload,
    buildings: buildingsPayload,
    construction: constructionPayload,
    research: researchPayload,
    market: marketPayload,
    crafts: productionPayload,
    players,
    playerDetailDiagnostics: {
      requested: playerPayload.requested ?? previousPayload(previous, "playerDetailDiagnostics", {}).requested ?? 0,
      failed: playerPayload.failed ?? previousPayload(previous, "playerDetailDiagnostics", {}).failed ?? 0,
      failures: playerPayload.failures ?? previousPayload(previous, "playerDetailDiagnostics", {}).failures ?? [],
    },
    contributions: Object.fromEntries(contributionEntries),
    region,
    regionStatus,
    tradeVolume,
    regionalBuyOrders,
    inventories: inventoriesPayload,
    recruitment: recruitmentPayload,
    layout: layoutPayload,
    skills: skillsPayload,
  };
}

function readCurrentClaimState(claimId) {
  const rowsByDomain = readDomainPayloadMap(claimId);
  if (!Object.keys(rowsByDomain).length) return null;
  return domainRowsToAppData(claimId, rowsByDomain);
}

async function refreshCurrentClaimState(claimId, options = {}) {
  // Background collectors maintain local history and notification inputs. Page
  // rendering intentionally still uses the BitJita proxy/live helper path so a
  // broken cached domain table cannot blank the main UI.
  const id = String(claimId ?? "").trim();
  const attemptedAt = new Date().toISOString();
  const metrics = blankCollectionMetrics();
  const dueCollectors = Object.entries(collectorPrimaryPayloadDomain)
    .filter(([key, domain]) => collectorDue(id, key, domain, options))
    .map(([key]) => key);
  const domainStartedAt = Object.fromEntries(dueCollectors.map((key) => [key, collectorAttempt(key)]));
  try {
    const data = await buildCurrentClaimData(id, { ...options, metrics });
    const collectedAt = new Date().toISOString();
    persistDomainPayloads(id, data, attemptedAt, collectedAt, metrics);
    applyCollectionMetrics(metrics, dueCollectors, id, collectedAt);
    for (const [key, startedAt] of Object.entries(domainStartedAt)) collectorSuccess(key, startedAt);
    return readCurrentClaimState(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const [key, startedAt] of Object.entries(domainStartedAt)) {
      statements.updateDomainPayloadError.run(attemptedAt, message, attemptedAt, id, key);
      collectorFailure(key, startedAt, error);
    }
    const cached = options.allowStaleOnError ? readCurrentClaimState(id) : null;
    if (cached) return cached;
    throw error;
  }
}

function collectorStatusPayload() {
  refreshCollectorStatusSettings();
  const intervalMs = serverRefreshIntervalMs();
  pollStatus.intervalMs = intervalMs;
  const nextRunAt = pollStatus.running ? null : pollStatus.nextRunAt;
  return {
    enabled: serverPollingEnabled,
    intervalMs,
    running: pollStatus.running,
    nextRunAt,
    lastAttemptAt: pollStatus.lastAttemptAt,
    lastSuccessAt: pollStatus.lastSuccessAt,
    lastError: pollStatus.lastError,
    lastRunMetrics: pollStatus.lastRunMetrics,
    collectors: Object.fromEntries(Object.entries(pollStatus.collectors).map(([key, value]) => {
      const domain = collectorPrimaryPayloadDomain[key];
      const row = domain ? statements.domainPayload.get(getSettings().claimId, domain) : null;
      const lastSuccessAt = value.lastSuccessAt ?? row?.last_success_at ?? row?.collected_at ?? null;
      const collectorNextRunAt = lastSuccessAt && value.enabled !== false
        ? new Date(new Date(lastSuccessAt).getTime() + toNumber(value.intervalMs ?? intervalMs)).toISOString()
        : value.nextRunAt ?? nextRunAt;
      return [key, { ...value, lastSuccessAt, nextRunAt: collectorNextRunAt }];
    })),
  };
}

let snapshotQueue = Promise.resolve();

function enqueueSnapshot(payload) {
  const queued = snapshotQueue.then(() => recordSnapshot(payload));
  snapshotQueue = queued.catch(() => undefined);
  return queued;
}

async function runMarketListingsCollector(claimId, currentData, force = false) {
  if (!sideEffectCollectorDue("marketListings", force)) return;
  const startedAt = collectorAttempt("marketListings");
  try {
    await syncMarketListingsForSnapshot(claimId, currentData.market ?? { listings: [] }, new Date().toISOString());
    collectorSuccess("marketListings", startedAt);
  } catch (error) {
    collectorFailure("marketListings", startedAt, error);
    throw error;
  }
}

async function runProductionActivityCollector(claimId, currentData) {
  const productionResult = await syncProductionJobActivityForSnapshot(claimId, currentData.crafts, new Date().toISOString());
  for (const diagnostic of productionResult.diagnostics ?? []) recordDiscordDeliverySafe(diagnostic);
  await deliverProductionNotifications(productionResult.pendingNotifications ?? []);
}

async function runProductionContributionCollector(claimId, currentData, force = false) {
  if (!sideEffectCollectorDue("productionContributions", force)) return;
  const startedAt = collectorAttempt("productionContributions");
  try {
    await syncProductionContributionsForSnapshot(claimId, currentData.crafts, new Date().toISOString());
    collectorSuccess("productionContributions", startedAt);
  } catch (error) {
    collectorFailure("productionContributions", startedAt, error);
    throw error;
  }
}
async function collectServerSnapshot(force = false) {
  // Polling is a side-effect loop: it records snapshots, imports activity/trade
  // history, and drives Discord notifications. Browser tabs should treat this as
  // supporting data, not as their exclusive source for live settlement state.
  if ((!serverPollingEnabled && !force) || pollStatus.running) return;
  pollStatus.running = true;
  pollStatus.intervalMs = serverRefreshIntervalMs();
  pollStatus.lastAttemptAt = new Date().toISOString();
  try {
    const { claimId } = getSettings();
    await processDiscordTempBans().catch((error) => console.warn(`Discord temporary ban processing failed: ${error instanceof Error ? error.message : String(error)}`));
    await refreshCurrentClaimState(claimId, { force });
    const currentData = domainRowsToAppData(claimId, readDomainPayloadMap(claimId));
    const claim = currentData.claim?.claim ?? currentData.claim;
    const members = unwrap(currentData.members, "members", []);
    const buildings = unwrap(currentData.buildings, "buildings", []);
    await sendScheduledSupplyReportIfDue(claim).catch((error) => console.warn(`Discord supply report failed: ${error instanceof Error ? error.message : String(error)}`));
    const snapshotStartedAt = collectorAttempt("snapshotHistory");
    await enqueueSnapshot({
      claimId,
      claim,
      membersCount: members.length,
      buildingsCount: buildings.length,
      market: currentData.market ?? { listings: [] },
      crafts: currentData.crafts ?? { craftResults: [] },
      source: "server_poll",
    });
    collectorSuccess("snapshotHistory", snapshotStartedAt);
    await runMarketListingsCollector(claimId, currentData, force);
    await runProductionActivityCollector(claimId, currentData);
    await runProductionContributionCollector(claimId, currentData, force);
    const storageStartedAt = collectorAttempt("storageActivity");
    pollStatus.storageLastAttemptAt = new Date().toISOString();
    const storageResult = await collectStorageActivity(claimId, currentData.inventories ?? { buildings: [] }, { budget: storageActivityJobBudget });
    pollStatus.storageRequests = storageResult.requested;
    pollStatus.storageInserted = storageResult.inserted;
    pollStatus.storageProcessed = storageResult.processed;
    pollStatus.storageComplete = storageResult.complete;
    pollStatus.storageLastError = storageResult.failures.length ? storageResult.failures.join("; ") : null;
    pollStatus.storageLastSuccessAt = new Date().toISOString();
    if (storageResult.failures.length) collectorFailure("storageActivity", storageStartedAt, new Error(storageResult.failures.join("; ")));
    else collectorSuccess("storageActivity", storageStartedAt);
    const marketStartedAt = collectorAttempt("marketTrades");
    const marketTradeResult = await importMemberSellTrades(claimId, members, { budget: marketTradeJobBudget });
    pollStatus.marketTradesProcessed = marketTradeResult.processed;
    pollStatus.marketTradesInserted = marketTradeResult.inserted;
    pollStatus.marketTradesComplete = marketTradeResult.complete;
    collectorSuccess("marketTrades", marketStartedAt);
    pollStatus.lastSuccessAt = new Date().toISOString();
    pollStatus.lastError = null;
  } catch (error) {
    pollStatus.lastError = error instanceof Error ? error.message : String(error);
    console.error(`BitCraft snapshot poll failed: ${pollStatus.lastError}`);
  } finally {
    pollStatus.running = false;
  }
}

function marketHistory(claimId, limit, owner = "") {
  const selectedOwner = String(owner ?? "").trim();
  const ownerClause = selectedOwner ? " AND lower(COALESCE(owner, '')) = lower(?)" : "";
  const args = selectedOwner ? [claimId, selectedOwner] : [claimId];
  const tradeOwnerClause = selectedOwner ? " AND lower(COALESCE(seller_username, '')) = lower(?)" : "";
  const tradeArgs = selectedOwner ? [claimId, selectedOwner] : [claimId];
  const eventLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const liveListings = db.prepare(`SELECT listing_key, item_name, quantity, price, total_value, owner, owner_entity_id, item_id, item_type, tier, rarity, side, first_seen, last_seen, raw_json FROM market_listings WHERE claim_id = ? AND status = 'active'${ownerClause}`).all(...args);
  const events = db.prepare(`SELECT * FROM market_events WHERE claim_id = ?${ownerClause} ORDER BY occurred_at DESC, id DESC LIMIT ?`).all(...args, eventLimit)
    .map((event) => event.event_type === "sold_or_removed" ? { ...event, event_type: "removed_or_cancelled" } : event);
  const sales = db.prepare(`
    SELECT trade_id AS id, 'sale' AS event_type, order_entity_id AS listing_key, item_name, seller_username AS owner,
      quantity, unit_price AS price, total_price AS total_value, tier, rarity, occurred_at, raw_json
    FROM market_trades
    WHERE claim_id = ?${tradeOwnerClause}
    ORDER BY occurred_at DESC, trade_id DESC
    LIMIT ?
  `).all(...tradeArgs, eventLimit);
  const topItems = db.prepare(`
    SELECT item_name AS itemName, COUNT(*) AS salesCount, SUM(quantity) AS unitsSold, SUM(total_price) AS totalValue,
      SUM(total_price) / NULLIF(SUM(quantity), 0) AS avgUnitPrice, MAX(occurred_at) AS lastSoldAt
    FROM market_trades
    WHERE claim_id = ?${tradeOwnerClause}
    GROUP BY item_name
    ORDER BY unitsSold DESC, totalValue DESC
    LIMIT 20
  `).all(...tradeArgs);
  const daily = db.prepare(`
    SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS salesCount, SUM(quantity) AS unitsSold, SUM(total_price) AS totalValue
    FROM market_trades
    WHERE claim_id = ?${tradeOwnerClause}
    GROUP BY day
    ORDER BY day DESC
    LIMIT 30
  `).all(...tradeArgs).reverse();
  const lifecycleTotals = db.prepare(`
    SELECT
      SUM(CASE WHEN event_type = 'new_listing' THEN 1 ELSE 0 END) AS newListings,
      SUM(CASE WHEN event_type IN ('removed_or_cancelled', 'sold_or_removed') THEN 1 ELSE 0 END) AS removedOrCancelled,
      SUM(CASE WHEN event_type IN ('partial_quantity_drop') THEN 1 ELSE 0 END) AS unconfirmedQuantityDrops
    FROM market_events
    WHERE claim_id = ?${ownerClause}
  `).get(...args);
  const tradeTotals = db.prepare(`
    SELECT COUNT(*) AS confirmedSales, SUM(quantity) AS confirmedUnits, SUM(total_price) AS trackedValue
    FROM market_trades
    WHERE claim_id = ?${tradeOwnerClause}
  `).get(...tradeArgs);
  const totals = { ...lifecycleTotals, ...tradeTotals };
  const pending = db.prepare(`
    SELECT * FROM market_events
    WHERE claim_id = ? AND event_type = 'partial_quantity_drop' AND trade_id IS NULL${ownerClause}
    ORDER BY occurred_at DESC
    LIMIT 30
  `).all(...args);
  return { liveListings, events, sales, topItems, daily, totals, pending };
}

function marketBuyOrders(claimId, params = {}) {
  const id = String(claimId ?? "").trim();
  const requestedRegion = String(params.regionId ?? "").trim();
  const regionId = requestedRegion && requestedRegion.toLowerCase() !== "all" ? requestedRegion : "";
  const query = String(params.search ?? params.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Math.floor(Number(params.page) || 1));
  const pageSize = [25, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 50;
  const direction = String(params.direction ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const sort = String(params.sort ?? "unitPrice");
  const where = ["claim_id = ?", "active = 1"];
  const args = [id];
  if (regionId) {
    where.push("region_id = ?");
    args.push(regionId);
  }
  if (query) {
    const pattern = `%${escapeSqlLike(query)}%`;
    where.push(`(
      lower(item_name) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(buyer_name, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(market_claim_name, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(region_name, '')) LIKE ? ESCAPE '\\'
      OR lower(COALESCE(rarity, '')) LIKE ? ESCAPE '\\'
    )`);
    args.push(pattern, pattern, pattern, pattern, pattern);
  }
  const rows = db.prepare(`
    SELECT * FROM market_buy_orders_current
    WHERE ${where.join(" AND ")}
    ORDER BY last_seen DESC
  `).all(...args);
  const salesByItem = new Map();
  const salesArgs = [id];
  const salesRegionClause = regionId ? " AND region_id = ?" : "";
  if (regionId) salesArgs.push(regionId);
  for (const row of db.prepare(`
    SELECT region_id, item_id, item_type, sales_count AS salesCount, units_sold AS unitsSold, total_value AS totalValue, average_unit_price AS averageUnitPrice
    FROM market_regional_sale_averages_current
    WHERE claim_id = ? AND window_days = 7${salesRegionClause}
  `).all(...salesArgs)) {
    const units = toNumber(row.unitsSold);
    const total = toNumber(row.totalValue);
    if (!row.item_id || units <= 0 || toNumber(row.salesCount) < 3) continue;
    salesByItem.set(`${row.region_id}:${row.item_type ?? 0}:${row.item_id}`, {
      salesCount: toNumber(row.salesCount),
      averageUnitPrice: toNumber(row.averageUnitPrice) || total / units,
    });
  }
  const normalized = rows.map((row) => {
    const raw = safeJson(row.raw_json, {});
    const sales = salesByItem.get(`${row.region_id}:${row.item_type ?? 0}:${row.item_id}`) ?? null;
    const averageUnitPrice = sales?.averageUnitPrice ?? null;
    const premiumPercent = averageUnitPrice && averageUnitPrice > 0 ? ((toNumber(row.unit_price) - averageUnitPrice) / averageUnitPrice) * 100 : null;
    return {
      orderKey: row.order_key,
      regionId: row.region_id,
      regionName: row.region_name,
      marketClaimId: row.market_claim_id,
      marketClaimName: row.market_claim_name,
      buyerEntityId: row.buyer_entity_id,
      buyerName: row.buyer_name,
      itemId: row.item_id,
      itemType: row.item_type,
      itemName: row.item_name,
      tier: row.tier,
      rarity: row.rarity,
      rarityStr: row.rarity,
      iconAssetName: row.icon_asset_name ?? raw.iconAssetName,
      quantity: toNumber(row.quantity),
      unitPrice: toNumber(row.unit_price),
      totalValue: toNumber(row.total_value),
      storedCoins: toNumber(row.stored_coins),
      listedAt: row.listed_at,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      averageUnitPrice,
      salesCount: sales?.salesCount ?? 0,
      premiumPercent,
      opportunityEligible: premiumPercent != null && premiumPercent > 0,
    };
  });
  const sorters = {
    item: (row) => row.itemName ?? "",
    tier: (row) => toNumber(row.tier),
    rarity: (row) => row.rarity ?? "",
    region: (row) => toNumber(row.regionId),
    buyer: (row) => row.buyerName ?? "",
    settlement: (row) => row.marketClaimName ?? "",
    quantity: (row) => toNumber(row.quantity),
    unitPrice: (row) => toNumber(row.unitPrice),
    totalValue: (row) => toNumber(row.totalValue),
    premium: (row) => row.premiumPercent ?? -Infinity,
    lastSeen: (row) => new Date(row.lastSeen ?? row.listedAt ?? 0).getTime(),
  };
  const sorter = sorters[sort] ?? sorters.unitPrice;
  normalized.sort((a, b) => {
    const av = sorter(a);
    const bv = sorter(b);
    if (typeof av === "string" || typeof bv === "string") return direction === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    return direction === "asc" ? toNumber(av) - toNumber(bv) : toNumber(bv) - toNumber(av);
  });
  const opportunities = normalized
    .filter((row) => row.opportunityEligible)
    .sort((a, b) => (b.premiumPercent ?? 0) - (a.premiumPercent ?? 0) || toNumber(b.totalValue) - toNumber(a.totalValue))
    .slice(0, 5);
  const offset = (page - 1) * pageSize;
  const total = normalized.length;
  const unfilteredRegionRows = rows.length;
  return {
    rows: normalized.slice(offset, offset + pageSize),
    opportunities,
    total,
    unfilteredRegionRows,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    sort,
    direction,
    regionId: regionId || "all",
    sortableFields: Object.keys(sorters),
    collectorStatus: collectorStatusPayload().collectors.buyOrders,
  };
}

function snapshotHistory(claimId, { limit = 96, daily = false, days = 7 } = {}) {
  const snapshotLimit = Math.min(Math.max(Number(limit) || 96, 2), 1000);
  if (daily) {
    const dayLimit = Math.min(Math.max(Number(days) || 7, 2), 30);
    const since = new Date(Date.now() - (dayLimit - 1) * 24 * 60 * 60 * 1000);
    since.setHours(0, 0, 0, 0);
    const rows = db.prepare(`
      SELECT s.id, s.claim_id, s.captured_at, s.supplies, s.treasury, s.members_count, s.buildings_count, s.market_count
      FROM snapshots s
      JOIN (
        SELECT substr(captured_at, 1, 10) AS day_key, MAX(captured_at) AS captured_at
        FROM snapshots
        WHERE claim_id = ? AND captured_at >= ?
        GROUP BY substr(captured_at, 1, 10)
      ) latest
        ON substr(s.captured_at, 1, 10) = latest.day_key
       AND s.captured_at = latest.captured_at
      WHERE s.claim_id = ?
      ORDER BY s.captured_at ASC, s.id ASC
    `).all(claimId, since.toISOString(), claimId);
    const snapshotsByDay = new Map();
    for (const row of rows) {
      const dayKey = String(row.captured_at ?? "").slice(0, 10);
      if (dayKey) snapshotsByDay.set(dayKey, row);
    }
    return { snapshots: Array.from(snapshotsByDay.values()).slice(-dayLimit) };
  }
  const snapshots = db.prepare(`
    SELECT id, claim_id, captured_at, supplies, treasury, members_count, buildings_count, market_count
    FROM snapshots
    WHERE claim_id = ?
    ORDER BY captured_at DESC, id DESC
    LIMIT ?
  `).all(claimId, snapshotLimit).reverse();
  return { snapshots };
}

function activityHistory(claimId, limit = 500) {
  const eventLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000);
  const events = db.prepare("SELECT * FROM activity_events WHERE claim_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ?").all(claimId, eventLimit);
  const total = toNumber(db.prepare("SELECT COUNT(*) AS count FROM activity_events WHERE claim_id = ?").get(claimId)?.count);
  return { events, total };
}

function notificationActivity(claimId, limit = 120) {
  const eventLimit = Math.min(Math.max(Number(limit) || 120, 1), 500);
  const notableTypes = ["market_new_listing", "market_sale", "market_sale_confirmed", "production_started", "production_completed"];
  const placeholders = notableTypes.map(() => "?").join(", ");
  const events = db.prepare(`
    SELECT *
    FROM activity_events
    WHERE claim_id = ? AND event_type IN (${placeholders})
    ORDER BY occurred_at DESC, id DESC
    LIMIT ?
  `).all(claimId, ...notableTypes, eventLimit).map((event) => publicNotificationActivityEvent(event));
  const total = toNumber(db.prepare(`
    SELECT COUNT(*) AS count
    FROM activity_events
    WHERE claim_id = ? AND event_type IN (${placeholders})
  `).get(claimId, ...notableTypes)?.count);
  return { events, total, eventTypes: notableTypes };
}

function escapeSqlLike(value) {
  return String(value ?? "").replace(/[\\%_]/g, (match) => `\\${match}`);
}

function activitySearch(claimId, query, limit = 500) {
  const search = String(query ?? "").trim();
  const eventLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  if (!search) return activityHistory(claimId, eventLimit);
  const pattern = `%${escapeSqlLike(search)}%`;
  const where = `
    claim_id = ?
    AND (
      summary LIKE ? ESCAPE '\\'
      OR event_type LIKE ? ESCAPE '\\'
      OR metadata_json LIKE ? ESCAPE '\\'
      OR occurred_at LIKE ? ESCAPE '\\'
    )
  `;
  const args = [claimId, pattern, pattern, pattern, pattern];
  const events = db.prepare(`
    SELECT *
    FROM activity_events
    WHERE ${where}
    ORDER BY occurred_at DESC, id DESC
    LIMIT ?
  `).all(...args, eventLimit);
  const total = toNumber(db.prepare(`SELECT COUNT(*) AS count FROM activity_events WHERE ${where}`).get(...args)?.count);
  return { events, total, query: search, searchedAllHistory: true };
}

function normalizedMemberName(value) {
  const name = String(value ?? "").trim();
  if (!name || name === "-" || /^unknown/i.test(name)) return "";
  return name;
}

function activityMemberName(row) {
  const metadata = safeJson(row.metadata_json, {});
  return normalizedMemberName(
    metadata.memberName ??
    metadata.member ??
    metadata.owner ??
    metadata.ownerUsername ??
    metadata.sellerUsername ??
    metadata.contributorName ??
    metadata.contributorUsername ??
    metadata.crafterName ??
    metadata.actorName ??
    metadata.playerName ??
    metadata.username ??
    metadata.userName ??
    metadata.subjectName
  );
}

function activityCategory(eventType) {
  const type = String(eventType ?? "").toLowerCase();
  if (type.includes("market") || type.includes("sale") || type.includes("listing")) return "marketEvents";
  if (type.includes("storage") || type.includes("deposit") || type.includes("withdraw")) return "storageEvents";
  if (type.includes("production") || type.includes("craft")) return "productionEvents";
  if (type.includes("construction")) return "constructionEvents";
  return "otherEvents";
}

function activityLeaderboard(claimId) {
  const rows = db.prepare(`
    SELECT *
    FROM activity_events
    WHERE claim_id = ?
    ORDER BY occurred_at DESC, id DESC
    LIMIT 5000
  `).all(claimId);
  const members = new Map();
  let ignoredRows = 0;
  for (const row of rows) {
    const name = activityMemberName(row);
    if (!name) {
      ignoredRows += 1;
      continue;
    }
    const key = name.toLowerCase();
    const current = members.get(key) ?? {
      name,
      totalEvents: 0,
      marketEvents: 0,
      storageEvents: 0,
      productionEvents: 0,
      constructionEvents: 0,
      otherEvents: 0,
      lastActivityAt: null,
      lastSummary: "",
    };
    current.totalEvents += 1;
    const category = activityCategory(row.event_type);
    current[category] = toNumber(current[category]) + 1;
    const occurredAt = row.occurred_at ?? "";
    if (!current.lastActivityAt || String(occurredAt) > current.lastActivityAt) {
      current.lastActivityAt = occurredAt;
      current.lastSummary = row.summary ?? "";
    }
    members.set(key, current);
  }
  const memberList = Array.from(members.values()).sort((a, b) => b.totalEvents - a.totalEvents || String(a.name).localeCompare(String(b.name)));
  return {
    summary: {
      memberCount: memberList.length,
      totalEvents: memberList.reduce((sum, row) => sum + toNumber(row.totalEvents), 0),
      ignoredRows,
      lastActivityAt: rows[0]?.occurred_at ?? null,
    },
    members: memberList,
  };
}

function marketLeaderboard(claimId) {
  const activeListings = db.prepare(`
    SELECT owner, owner_entity_id, quantity, price, total_value, last_seen
    FROM market_listings
    WHERE claim_id = ? AND status = 'active'
  `).all(claimId);
  const trades = db.prepare(`
    SELECT seller_username, seller_entity_id, quantity, total_price, occurred_at
    FROM market_trades
    WHERE claim_id = ?
    ORDER BY occurred_at DESC, trade_id DESC
  `).all(claimId);
  const members = new Map();
  const getMember = (name, id = "") => {
    const memberName = normalizedMemberName(name);
    if (!memberName) return null;
    const key = String(id || memberName).toLowerCase();
    const current = members.get(key) ?? {
      memberId: id || null,
      name: memberName,
      activeListings: 0,
      activeListingValue: 0,
      confirmedSales: 0,
      confirmedSaleValue: 0,
      unitsSold: 0,
      lastSaleAt: null,
    };
    if (!current.memberId && id) current.memberId = id;
    members.set(key, current);
    return current;
  };
  for (const listing of activeListings) {
    const member = getMember(listing.owner, listing.owner_entity_id);
    if (!member) continue;
    member.activeListings += 1;
    member.activeListingValue += toNumber(listing.total_value) || toNumber(listing.quantity) * toNumber(listing.price);
  }
  for (const trade of trades) {
    const member = getMember(trade.seller_username, trade.seller_entity_id);
    if (!member) continue;
    member.confirmedSales += 1;
    member.confirmedSaleValue += toNumber(trade.total_price);
    member.unitsSold += toNumber(trade.quantity);
    const occurredAt = trade.occurred_at ?? "";
    if (!member.lastSaleAt || String(occurredAt) > member.lastSaleAt) member.lastSaleAt = occurredAt;
  }
  const memberList = Array.from(members.values())
    .sort((a, b) => b.confirmedSaleValue - a.confirmedSaleValue || b.activeListingValue - a.activeListingValue || String(a.name).localeCompare(String(b.name)));
  return {
    summary: {
      memberCount: memberList.length,
      activeListings: activeListings.length,
      activeListingValue: memberList.reduce((sum, row) => sum + toNumber(row.activeListingValue), 0),
      confirmedSales: trades.length,
      confirmedSaleValue: memberList.reduce((sum, row) => sum + toNumber(row.confirmedSaleValue), 0),
      unitsSold: memberList.reduce((sum, row) => sum + toNumber(row.unitsSold), 0),
      lastSaleAt: trades[0]?.occurred_at ?? null,
    },
    members: memberList,
  };
}

function contributionLeaderboard(claimId) {
  const rows = db.prepare(`
    SELECT *
    FROM production_contributions
    WHERE claim_id = ?
    ORDER BY last_contributed_at DESC, updated_at DESC
    LIMIT 5000
  `).all(claimId);
  const contributors = new Map();
  const professions = new Map();
  for (const row of rows) {
    const contributorKey = String(row.contributor_entity_id || row.contributor_name);
    const profession = String(row.profession || "Unknown");
    const contributor = contributors.get(contributorKey) ?? {
      contributorId: row.contributor_entity_id,
      name: row.contributor_name,
      totalProgress: 0,
      totalXp: 0,
      contributionCount: 0,
      craftCount: 0,
      lastContributedAt: null,
      professions: {},
    };
    contributor.totalProgress += toNumber(row.contributed_progress);
    contributor.totalXp += toNumber(row.contributed_xp);
    contributor.contributionCount += toNumber(row.contribution_count);
    contributor.craftCount += 1;
    if (!contributor.lastContributedAt || String(row.last_contributed_at ?? row.updated_at) > contributor.lastContributedAt) contributor.lastContributedAt = row.last_contributed_at ?? row.updated_at;
    contributor.professions[profession] = {
      progress: toNumber(contributor.professions[profession]?.progress) + toNumber(row.contributed_progress),
      xp: toNumber(contributor.professions[profession]?.xp) + toNumber(row.contributed_xp),
      crafts: toNumber(contributor.professions[profession]?.crafts) + 1,
    };
    contributors.set(contributorKey, contributor);

    const professionRow = professions.get(profession) ?? {
      profession,
      totalProgress: 0,
      totalXp: 0,
      craftCount: 0,
      contributorCount: new Set(),
      topContributor: "",
      topContributorProgress: 0,
      contributors: new Map(),
    };
    professionRow.totalProgress += toNumber(row.contributed_progress);
    professionRow.totalXp += toNumber(row.contributed_xp);
    professionRow.craftCount += 1;
    professionRow.contributorCount.add(contributorKey);
    const professionContributor = toNumber(professionRow.contributors.get(contributorKey)?.progress) + toNumber(row.contributed_progress);
    professionRow.contributors.set(contributorKey, { name: row.contributor_name, progress: professionContributor });
    if (professionContributor > professionRow.topContributorProgress) {
      professionRow.topContributor = row.contributor_name;
      professionRow.topContributorProgress = professionContributor;
    }
    professions.set(profession, professionRow);
  }
  const contributorList = Array.from(contributors.values())
    .map((entry) => ({ ...entry, professions: Object.entries(entry.professions).map(([profession, values]) => ({ profession, ...values })).sort((a, b) => b.progress - a.progress) }))
    .sort((a, b) => b.totalProgress - a.totalProgress);
  const professionList = Array.from(professions.values())
    .map((entry) => ({
      profession: entry.profession,
      totalProgress: entry.totalProgress,
      totalXp: entry.totalXp,
      craftCount: entry.craftCount,
      contributorCount: entry.contributorCount.size,
      topContributor: entry.topContributor,
      topContributorProgress: entry.topContributorProgress,
    }))
    .sort((a, b) => b.totalProgress - a.totalProgress);
  const contribution = {
    summary: {
      contributorCount: contributorList.length,
      professionCount: professionList.length,
      totalProgress: contributorList.reduce((sum, row) => sum + row.totalProgress, 0),
      totalXp: contributorList.reduce((sum, row) => sum + row.totalXp, 0),
      recordedCrafts: new Set(rows.map((row) => row.craft_entity_id)).size,
      lastContributedAt: rows[0]?.last_contributed_at ?? null,
    },
    contributors: contributorList.slice(0, 100),
    professions: professionList,
    recent: rows.slice(0, 50).map((row) => ({
      contributorId: row.contributor_entity_id,
      contributorName: row.contributor_name,
      profession: row.profession,
      craftLabel: row.craft_label,
      structureName: row.structure_name,
      itemTier: row.item_tier,
      totalProgress: toNumber(row.contributed_progress),
      totalXp: toNumber(row.contributed_xp),
      contributionCount: toNumber(row.contribution_count),
      firstContributedAt: row.first_contributed_at,
      lastContributedAt: row.last_contributed_at,
    })),
  };
  return {
    ...contribution,
    contribution,
    market: marketLeaderboard(claimId),
    activity: activityLeaderboard(claimId),
  };
}

function dashboardHistory(claimId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const treasuryRows = db.prepare(`
    SELECT metadata_json
    FROM activity_events
    WHERE claim_id = ? AND event_type = 'treasury' AND occurred_at >= ?
  `).all(claimId, todayStart.toISOString());
  const treasuryNetToday = treasuryRows.reduce((total, row) => {
    const metadata = safeJson(row.metadata_json, {});
    if (metadata.before == null || metadata.after == null) return total;
    return total + (toNumber(metadata.after) - toNumber(metadata.before));
  }, 0);
  const recentActivity = db.prepare(`
    SELECT *
    FROM activity_events
    WHERE claim_id = ? AND event_type NOT IN ('treasury', 'supplies')
    ORDER BY occurred_at DESC, id DESC
    LIMIT 5
  `).all(claimId);
  return { treasuryNetToday, recentActivity };
}

function localHistory(claimId, include = null, options = {}) {
  const sections = include instanceof Set && include.size ? include : new Set(["market", "activity", "snapshots"]);
  const history = {};
  if (sections.has("market")) history.market = marketHistory(claimId, 120);
  if (sections.has("activity")) history.activity = activityHistory(claimId, Math.min(Math.max(Number(options.activityLimit) || 2000, 1), 2000));
  if (sections.has("snapshots")) history.snapshots = snapshotHistory(claimId, { daily: true, days: 7, limit: 96 });
  if (sections.has("dashboard")) history.dashboard = dashboardHistory(claimId);
  return history;
}

function resolveMarketEvent(body) {
  const id = Number(body.id);
  const claimId = String(body.claimId ?? "");
  if (!id || !claimId) throw new Error("Missing market event id or claim id");
  const event = db.prepare("SELECT * FROM market_events WHERE id = ? AND claim_id = ?").get(id, claimId);
  if (!event) throw new Error("Market event not found");
  if (event.event_type !== "partial_quantity_drop") throw new Error("Only partial quantity drops can be manually resolved");
  const raw = JSON.stringify({ resolvedAs: "quantity_cancelled", resolvedAt: new Date().toISOString(), previous: safeJson(event.raw_json) });
  statements.resolveMarketEvent.run("quantity_cancelled", raw, id, claimId);
  addActivity(claimId, "market_quantity_cancelled", `Marked cancelled: ${event.item_name} x${toNumber(event.quantity).toLocaleString()} at ${toNumber(event.price).toLocaleString()}g`, new Date().toISOString(), { id, itemName: event.item_name, quantity: event.quantity, price: event.price, owner: event.owner });
  return { ok: true };
}

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(value ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function databaseStatus() {
  const counts = Object.fromEntries(["snapshots", "market_listings", "market_events", "market_trades", "activity_events", "analytics_events"].map((table) => [
    table,
    toNumber(db.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get()?.count),
  ]));
  const discordLastDelivery = safeJson(statements.getSetting.get("discord_last_delivery_json")?.value, { status: "none" });
  const discordOutboxCounts = Object.fromEntries(statements.discordNotificationOutboxCounts.all().map((row) => [row.status, toNumber(row.count)]));
  const discordDeliveryLog = statements.recentDiscordDeliveries.all(80).map((row) => ({
    ...row,
    metadata: safeJson(row.metadata_json, {}),
    response: row.response_json ? safeJson(row.response_json, {}) : null,
  }));
  return {
    version: appVersion,
    environment: isProduction ? "production" : "development",
    storageLabel: isProduction ? "Production persistent storage" : "Local development storage",
    databaseSize: existsSync(databasePath) ? statSync(databasePath).size : 0,
    counts,
    polling: collectorStatusPayload(),
    discord: { lastDelivery: discordLastDelivery, deliveryLog: discordDeliveryLog, outbox: discordOutboxCounts, gateway: { ...discordGatewayStatus } },
    settings: getSettings(),
  };
}

async function apiDiagnostics() {
  const { claimId } = getSettings();
  const checks = [
    ["Settlement", `/claims/${claimId}`],
    ["Members", `/claims/${claimId}/members`],
    ["Structures", `/claims/${claimId}/buildings`],
    ["Inventory", `/claims/${claimId}/inventories`],
    ["Market", `/claims/${claimId}/market/listings?limit=5`],
    ["Production", `/crafts?claimEntityId=${claimId}&completed=false`],
  ];
  const timedCheck = async (label, endpoint) => {
    const started = Date.now();
    try {
      const value = await fetchBitjita(endpoint);
      return { result: { label, endpoint, ok: true, durationMs: Date.now() - started, checkedAt: new Date().toISOString() }, value };
    } catch (error) {
      return { result: { label, endpoint, ok: false, durationMs: Date.now() - started, checkedAt: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) }, value: null };
    }
  };
  const core = await Promise.all(checks.map(([label, endpoint]) => timedCheck(label, endpoint)));
  const inventories = core.find((check) => check.result.label === "Inventory")?.value;
  const storageBuildings = unwrap(inventories, "buildings", []).filter((building) => building.entityId && !isDeployableStorage(building));
  const storage = await mapWithConcurrency(storageBuildings, 4, (building) => timedCheck(`Storage: ${storageContainerName(building)}`, `/logs/storage?buildingEntityId=${building.entityId}&limit=40`));
  return [...core, ...storage].map((check) => check.result);
}

function csvValue(value) {
  const text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

const brandingFormats = {
  "image/png": { extension: ".png", contentType: "image/png" },
  "image/jpeg": { extension: ".jpg", contentType: "image/jpeg" },
  "image/webp": { extension: ".webp", contentType: "image/webp" },
};

function validImageBytes(contentType, bytes) {
  if (contentType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  return false;
}

async function saveBrandingAsset(type, dataUrl) {
  if (!["logo", "favicon"].includes(type)) throw new Error("Unknown branding asset type");
  const match = String(dataUrl ?? "").match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !brandingFormats[match[1]]) throw new Error("Use a PNG, JPG or WebP image");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 1024 * 1024) throw new Error("Image must be smaller than 1 MB");
  if (!validImageBytes(match[1], bytes)) throw new Error("Image content does not match its declared file type");
  const format = brandingFormats[match[1]];
  const fileName = `${type}${format.extension}`;
  for (const possible of Object.values(brandingFormats).map((candidate) => path.join(brandingDir, `${type}${candidate.extension}`))) {
    if (possible !== path.join(brandingDir, fileName) && existsSync(possible)) unlinkSync(possible);
  }
  await writeFile(path.join(brandingDir, fileName), bytes);
  const current = getSettings().branding;
  const branding = {
    ...current,
    [type]: { fileName, contentType: format.contentType, updatedAt: new Date().toISOString(), url: `/api/local/branding/${type}` },
  };
  statements.upsertSetting.run("branding_json", JSON.stringify(branding), new Date().toISOString());
  return branding;
}

function brandingAsset(type) {
  const asset = getSettings().branding?.[type];
  if (!asset?.fileName) return null;
  const filePath = path.join(brandingDir, path.basename(asset.fileName));
  if (!existsSync(filePath)) return null;
  return { ...asset, filePath };
}

function backupNames() {
  return existsSync(backupDir) ? readdirSync(backupDir)
    .filter((name) => /^bitcraft-local-\d{4}-\d{2}-\d{2}T[\d-]+Z\.sqlite$/.test(name))
    .map((name) => {
      const info = statSync(path.join(backupDir, name));
      return { name, size: info.size, createdAt: info.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
}

function createBackup() {
  const name = `bitcraft-local-${new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z")}.sqlite`;
  const filePath = path.join(backupDir, name);
  db.exec(`VACUUM INTO '${filePath.replaceAll("'", "''")}'`);
  const info = statSync(filePath);
  return { name, size: info.size, createdAt: info.mtime.toISOString() };
}


const discordCommands = [
  { name: "help", description: "Show Timbersteel Trade bot commands and app links." },
  { name: "supplies", description: "Show settlement supplies, upkeep and runway." },
  { name: "online", description: "Show which settlement members are online." },
  {
    name: "crafts",
    description: "List current settlement crafts.",
    options: [{ type: 3, name: "skill", description: "Optional profession/skill filter", required: false }],
  },
  {
    name: "price",
    description: "Look up recent BitJita sale pricing for an item.",
    options: [
      { type: 3, name: "item", description: "Item name", required: true, autocomplete: true },
      { type: 4, name: "region", description: "Region number, defaults to settlement region", required: false },
    ],
  },
  {
    name: "craftwatch",
    description: "Manage your craft profession notification roles.",
    options: [
      { type: 1, name: "list", description: "List your current craft notification roles." },
      { type: 1, name: "clear", description: "Remove all of your craft notification roles." },
    ],
  },
];

function registeredDiscordCommands() {
  return [
    ...discordCommands,
    ...statements.listDiscordCustomCommands.all().map((command) => ({
      name: command.name,
      description: String(command.description || "Custom Timbersteel command").slice(0, 100),
    })),
  ];
}

function discordOption(interaction, name) {
  return interaction?.data?.options?.find((option) => option.name === name)?.value;
}

function discordSubcommand(interaction) {
  return interaction?.data?.options?.find((option) => option.type === 1)?.name ?? "";
}

function verifyDiscordInteraction(req, rawBody, publicKeyHex) {
  const signature = String(req.headers["x-signature-ed25519"] ?? "");
  const timestamp = String(req.headers["x-signature-timestamp"] ?? "");
  if (!signature || !timestamp || !/^[0-9a-f]{64}$/i.test(publicKeyHex)) return false;
  try {
    const spkiPrefix = "302a300506032b6570032100";
    const key = createPublicKey({ key: Buffer.from(`${spkiPrefix}${publicKeyHex}`, "hex"), format: "der", type: "spki" });
    return verify(null, Buffer.concat([Buffer.from(timestamp), rawBody]), key, Buffer.from(signature, "hex"));
  } catch {
    return false;
  }
}

function discordResponse(content, options = {}) {
  const data = {
    flags: options.ephemeral ? 64 : undefined,
    allowed_mentions: { parse: [] },
  };
  if (options.embeds) data.embeds = options.embeds;
  else data.content = String(content).slice(0, 1900);
  return {
    type: 4,
    data,
  };
}

function discordUpdateMessageResponse(data) {
  return {
    type: 7,
    data: {
      allowed_mentions: { parse: [] },
      ...data,
    },
  };
}

function discordCommandEmbed(title, description, fields = [], color = 0xf0c64f) {
  return {
    author: { name: "Timbersteel Trade" },
    title,
    description,
    color,
    fields: fields.slice(0, 10),
    timestamp: new Date().toISOString(),
    footer: { text: "BitCraft settlement monitor" },
  };
}

const discordPresenceActivityTypes = { playing: 0, listening: 2, watching: 3, competing: 5 };
let discordGatewaySocket = null;
let discordGatewayHeartbeat = null;
let discordGatewayReconnect = null;
let discordGatewaySessionToken = "";
const discordGatewayStatus = { connected: false, lastConnectedAt: null, lastDisconnectedAt: null, lastError: null, activity: "" };

function discordGatewayActivity(presence) {
  return {
    name: presence.activityText,
    type: discordPresenceActivityTypes[presence.activityType] ?? 3,
  };
}

function stopDiscordGateway() {
  if (discordGatewayHeartbeat) clearInterval(discordGatewayHeartbeat);
  if (discordGatewayReconnect) clearTimeout(discordGatewayReconnect);
  discordGatewayHeartbeat = null;
  discordGatewayReconnect = null;
  discordGatewaySessionToken = "";
  if (discordGatewaySocket) {
    try { discordGatewaySocket.close(); } catch {}
  }
  discordGatewaySocket = null;
  discordGatewayStatus.connected = false;
  discordGatewayStatus.lastDisconnectedAt = new Date().toISOString();
}

function scheduleDiscordGatewayReconnect(delayMs = 15000) {
  if (discordGatewayReconnect) clearTimeout(discordGatewayReconnect);
  discordGatewayReconnect = setTimeout(() => {
    discordGatewayReconnect = null;
    startDiscordGateway();
  }, delayMs);
}

function startDiscordGateway() {
  if (!discordStartupEnabled) {
    stopDiscordGateway();
    discordGatewayStatus.lastError = null;
    return;
  }
  const settings = getDiscordSettingsRaw();
  const presence = normalizeDiscordPresence(settings.presence ?? {});
  if (!settings.enabled || !settings.botToken || !presence.enabled || typeof WebSocket !== "function") {
    stopDiscordGateway();
    discordGatewayStatus.lastError = typeof WebSocket !== "function" ? "WebSocket is not available in this Node runtime" : null;
    return;
  }
  if (discordGatewaySocket && discordGatewaySessionToken === `${settings.botToken}:${presence.status}:${presence.activityType}:${presence.activityText}`) return;
  stopDiscordGateway();
  discordGatewaySessionToken = `${settings.botToken}:${presence.status}:${presence.activityType}:${presence.activityText}`;
  discordGatewayStatus.activity = `${presence.status} - ${presence.activityType} ${presence.activityText}`;
  const socket = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");
  discordGatewaySocket = socket;
  socket.addEventListener("message", (event) => {
    const payload = safeJson(event.data, {});
    if (payload.op === 10) {
      const interval = Math.max(toNumber(payload.d?.heartbeat_interval), 10000);
      const heartbeat = () => {
        try { socket.send(JSON.stringify({ op: 1, d: null })); } catch {}
      };
      discordGatewayHeartbeat = setInterval(heartbeat, interval);
      heartbeat();
      socket.send(JSON.stringify({
        op: 2,
        d: {
          token: settings.botToken,
          intents: 0,
          properties: { os: "linux", browser: "timbersteel-trade", device: "timbersteel-trade" },
          presence: {
            status: presence.status,
            since: null,
            afk: false,
            activities: [discordGatewayActivity(presence)],
          },
        },
      }));
    }
    if (payload.op === 9) {
      discordGatewayStatus.lastError = "Discord gateway invalid session";
      scheduleDiscordGatewayReconnect(5000);
    }
  });
  socket.addEventListener("open", () => {
    discordGatewayStatus.connected = true;
    discordGatewayStatus.lastConnectedAt = new Date().toISOString();
    discordGatewayStatus.lastError = null;
  });
  socket.addEventListener("close", () => {
    if (discordGatewayHeartbeat) clearInterval(discordGatewayHeartbeat);
    discordGatewayHeartbeat = null;
    if (discordGatewaySocket === socket) discordGatewaySocket = null;
    discordGatewayStatus.connected = false;
    discordGatewayStatus.lastDisconnectedAt = new Date().toISOString();
    if (settings.enabled && settings.botToken && presence.enabled) scheduleDiscordGatewayReconnect();
  });
  socket.addEventListener("error", (event) => {
    discordGatewayStatus.lastError = event?.message ? String(event.message) : "Discord gateway connection error";
  });
}

function discordEmbedResponse(embed, options = {}) {
  return discordResponse("", { ...options, embeds: [embed] });
}

async function handleDiscordInteraction(req) {
  const rawBody = await readRawBody(req, BODY_LIMITS.discordInteraction);
  const settings = getDiscordSettingsRaw();
  if (!settings.publicKey || !verifyDiscordInteraction(req, rawBody, settings.publicKey)) {
    return { status: 401, body: { error: "Invalid Discord request signature" } };
  }
  const interaction = JSON.parse(rawBody.toString("utf8") || "{}");
  if (interaction.type === 1) return { status: 200, body: { type: 1 } };
  if (interaction.type === 4) return { status: 200, body: await discordAutocomplete(interaction) };
  if (interaction.type === 3) return { status: 200, body: await handleDiscordComponent(interaction) };
  if (interaction.type !== 2) return { status: 200, body: discordResponse("Unsupported Discord interaction.", { ephemeral: true }) };
  return { status: 200, body: await runDiscordCommand(interaction) };
}

async function discordAutocomplete(interaction) {
  const focused = interaction?.data?.options?.find((option) => option.focused);
  if (interaction?.data?.name !== "price" || focused?.name !== "item") return { type: 8, data: { choices: [] } };
  const query = String(focused.value ?? "").trim();
  if (query.length < 2) return { type: 8, data: { choices: [] } };
  try {
    const payload = await fetchBitjita(`/market?search=${encodeURIComponent(query)}`);
    const entries = unwrap(payload, "items", []).slice(0, 20);
    return { type: 8, data: { choices: entries.map((item) => ({ name: String(item.name ?? item.itemName ?? "Item").slice(0, 100), value: String(item.name ?? item.itemName ?? query).slice(0, 100) })) } };
  } catch {
    return { type: 8, data: { choices: [] } };
  }
}

function discordHelpCommand() {
  const appUrl = "https://app.timbersteeltrade.com";
  return discordCommandEmbed("Timbersteel Trade Help", `[Open the dashboard](${appUrl}) for settlement monitoring, market analytics, public craft finding and bot settings.`, [
    { name: "/supplies", value: "Current settlement supplies, upkeep and runway.", inline: false },
    { name: "/online", value: "Shows which settlement members are currently online.", inline: false },
    { name: "/crafts", value: "Lists current settlement crafts. Optional skill filter supported.", inline: false },
    { name: "/price", value: "Looks up recent BitJita sale prices for an item.", inline: false },
    { name: "/craftwatch", value: "Shows and clears your profession notification roles.", inline: false },
    { name: "Links", value: `[App](${appUrl}) | [Feature requests](https://github.com/Red463/bitcraft-claim-monitor/issues)`, inline: false },
  ], 0x5865f2);
}

async function runDiscordCommand(interaction) {
  try {
    const command = String(interaction.data?.name ?? "");
    if (command === "help") return discordEmbedResponse(discordHelpCommand());
    if (command === "supplies") return discordEmbedResponse(await discordSuppliesCommand());
    if (command === "online") return discordEmbedResponse(await discordOnlineCommand());
    if (command === "crafts") return discordEmbedResponse(await discordCraftsCommand(String(discordOption(interaction, "skill") ?? "")));
    if (command === "price") return discordEmbedResponse(await discordPriceCommand(String(discordOption(interaction, "item") ?? ""), discordOption(interaction, "region")));
    if (command === "craftwatch") return await discordCraftWatchCommand(interaction);
    const custom = statements.getDiscordCustomCommand.get(command);
    if (custom) return discordResponse(custom.response, { ephemeral: false });
    return discordResponse("Unknown command.", { ephemeral: true });
  } catch (error) {
    return discordResponse(`Command failed: ${error instanceof Error ? error.message : String(error)}`, { ephemeral: true });
  }
}

async function handleDiscordComponent(interaction) {
  try {
    const customId = String(interaction.data?.custom_id ?? "");
    if (customId.startsWith("poll:")) return await handleDiscordVoteComponent(interaction, "poll");
    if (customId.startsWith("rsvp:")) return await handleDiscordVoteComponent(interaction, "rsvp");
    if (customId.startsWith("colourrole:")) return await handleDiscordColourRoleComponent(interaction);
    if (customId.startsWith("rolepanel:")) return await handleDiscordRolePanelComponent(interaction);
    if (customId.startsWith("welcome:")) return await handleDiscordWelcomeComponent(interaction);
    if (!customId.startsWith("craftwatch:")) return discordResponse("Unknown button.", { ephemeral: true });
    const [, action, professionKeyRaw, professionNameRaw = ""] = customId.split(":");
    const professionKey = normalizeProfessionKey(professionKeyRaw);
    const professionName = decodeURIComponent(professionNameRaw || professionKey || "Profession");
    const guildId = String(interaction.guild_id ?? "");
    const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
    const settings = getDiscordSettingsRaw();
    const roleId = String(settings.craftRoles?.[professionKey] ?? "").trim();
    if (!guildId || !userId || !professionKey) return discordResponse("Unable to update this watch. Discord did not provide enough context.", { ephemeral: true });
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    if (!roleId) return discordResponse(`${professionName} does not have a configured notification role yet.`, { ephemeral: true });
    const memberRoles = await getDiscordMemberRoleSet(guildId, userId, settings, interaction.member?.roles);
    if (action === "watch") {
      const removing = memberRoles.has(roleId);
      if (removing) await removeDiscordMemberRole(guildId, userId, roleId, settings);
      else await addDiscordMemberRole(guildId, userId, roleId, settings);
      recordDiscordDeliverySafe({
        status: "sent",
        eventType: "craftwatch_role",
        summary: `${removing ? "Removed" : "Added"} ${professionName} notification role`,
        reason: removing ? "Watch button toggled off" : "Watch button toggled on",
        metadata: { guildId, userId, professionKey, professionName, roleId, action: removing ? "remove" : "add" },
      });
      return discordResponse(
        removing
          ? `Stopped watching ${professionName} craft notifications. The ${professionName} notification role was removed from you.`
          : `You now have the ${professionName} notification role. Craft alerts always ping this role, so you will receive those pings while you have it. Click Toggle ${professionName} Notifications again to remove the role.`,
        { ephemeral: true },
      );
    }
    return discordResponse("Unknown craft watch action.", { ephemeral: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const customId = String(interaction.data?.custom_id ?? "");
    recordDiscordDeliverySafe({
      status: "failed",
      eventType: "craftwatch_role",
      summary: "Craft watch role update failed",
      error: message,
      metadata: { customId, guildId: interaction.guild_id, userId: interaction.member?.user?.id ?? interaction.user?.id },
    });
    return discordResponse(`Craft watch role update failed: ${message}`, { ephemeral: true });
  }
}

function discordComponentOptionsFromMessage(interaction, kind) {
  const prefix = `${kind}:`;
  const components = Array.isArray(interaction.message?.components) ? interaction.message.components : [];
  return components
    .flatMap((row) => Array.isArray(row.components) ? row.components : [])
    .map((component) => {
      const customId = String(component.custom_id ?? "");
      if (!customId.startsWith(prefix)) return null;
      const [, key, rawLabel = component.label ?? key] = customId.split(":");
      return { key, label: String(component.label ?? decodeURIComponent(rawLabel || key)) };
    })
    .filter(Boolean);
}

function discordComponentMessageMetadata(messageId, kind, interaction) {
  const row = statements.getDiscordComponentMessage.get(messageId, kind);
  if (row?.metadata_json) {
    try {
      const metadata = JSON.parse(row.metadata_json);
      if (Array.isArray(metadata.options) && metadata.options.length) return metadata;
    } catch {}
  }
  const options = discordComponentOptionsFromMessage(interaction, kind);
  const embed = Array.isArray(interaction.message?.embeds) ? interaction.message.embeds[0] : null;
  return {
    title: String(embed?.title ?? (kind === "rsvp" ? "Event RSVP" : "Poll")),
    description: String(embed?.description ?? (kind === "rsvp" ? "Choose your RSVP below." : "Vote using the buttons below.")),
    color: toNumber(embed?.color) || (kind === "rsvp" ? 0x4ee28a : 0x5865f2),
    options,
  };
}

function discordComponentCountFields(metadata, counts) {
  const byKey = new Map(counts.map((row) => [String(row.component_key), toNumber(row.count)]));
  const options = Array.isArray(metadata.options) ? metadata.options : [];
  return options.map((option, index) => {
    const count = byKey.get(String(option.key)) ?? 0;
    return {
      name: `${index + 1}. ${option.label}`,
      value: `${count.toLocaleString("en-GB")} vote${count === 1 ? "" : "s"}`,
      inline: true,
    };
  });
}

async function handleDiscordVoteComponent(interaction, kind) {
  const customId = String(interaction.data?.custom_id ?? "");
  const [, key, rawLabel = key] = customId.split(":");
  const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
  const messageId = String(interaction.message?.id ?? "");
  if (!userId || !messageId || !key) return discordResponse("Unable to record that selection.", { ephemeral: true });
  statements.upsertDiscordComponentVote.run(messageId, key, userId, kind, new Date().toISOString());
  const counts = statements.componentVoteCounts.all(messageId, kind);
  const metadata = discordComponentMessageMetadata(messageId, kind, interaction);
  if (metadata.options?.length) statements.upsertDiscordComponentMessage.run(messageId, kind, JSON.stringify(metadata), new Date().toISOString());
  const option = metadata.options?.find((entry) => String(entry.key) === key);
  const label = String(option?.label ?? decodeURIComponent(rawLabel || key));
  const fields = discordComponentCountFields(metadata, counts);
  if (!fields.length) return discordResponse(`Recorded: ${label}.`, { ephemeral: true });
  recordDiscordDeliverySafe({
    status: "sent",
    eventType: `${kind}_vote`,
    summary: `${kind === "rsvp" ? "RSVP" : "Poll"} vote recorded: ${label}`,
    metadata: { messageId, kind, componentKey: key, label, userId },
  });
  return discordUpdateMessageResponse({
    embeds: [discordCommandEmbed(metadata.title, metadata.description, fields, metadata.color)],
    components: interaction.message?.components ?? [],
  });
}

async function handleDiscordRolePanelComponent(interaction) {
  const customId = String(interaction.data?.custom_id ?? "");
  try {
    const [, panelKey, optionKey] = customId.split(":");
    const settings = getDiscordSettingsRaw();
    const guildId = String(interaction.guild_id ?? "");
    const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
    if (!guildId || !userId) return discordResponse("Role panels can only be used inside the Discord server.", { ephemeral: true });
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    const panel = settings.rolePanels.find((entry) => entry.key === panelKey);
    const option = panel?.options?.find((entry) => entry.key === optionKey);
    if (!panel || !option?.roleId) return discordResponse("That role option is no longer configured. Ask an admin to update the panel.", { ephemeral: true });
    const memberRoles = await getDiscordMemberRoleSet(guildId, userId, settings, interaction.member?.roles);
    const removing = memberRoles.has(option.roleId);
    if (panel.mode === "single") {
      for (const other of panel.options ?? []) {
        if (other.roleId && other.roleId !== option.roleId && memberRoles.has(other.roleId)) await removeDiscordMemberRole(guildId, userId, other.roleId, settings);
      }
      if (removing) await removeDiscordMemberRole(guildId, userId, option.roleId, settings);
      else await addDiscordMemberRole(guildId, userId, option.roleId, settings);
    } else {
      if (removing) await removeDiscordMemberRole(guildId, userId, option.roleId, settings);
      else await addDiscordMemberRole(guildId, userId, option.roleId, settings);
    }
    recordDiscordDeliverySafe({
      status: "sent",
      eventType: "role_panel_toggle",
      summary: `${removing ? "Removed" : "Added"} ${option.label}`,
      metadata: { guildId, userId, panelKey, optionKey, roleId: option.roleId, mode: panel.mode, action: removing ? "remove" : "add" },
    });
    return discordResponse(removing ? `Removed ${option.label}.` : `Added ${option.label}.`, { ephemeral: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({ status: "failed", eventType: "role_panel_toggle", summary: "Role panel update failed", error: message, metadata: { customId, guildId: interaction.guild_id, userId: interaction.member?.user?.id ?? interaction.user?.id } });
    return discordResponse(`Role update failed: ${message}`, { ephemeral: true });
  }
}

async function handleDiscordWelcomeComponent(interaction) {
  const customId = String(interaction.data?.custom_id ?? "");
  try {
    const [, action] = customId.split(":");
    const settings = getDiscordSettingsRaw();
    const flow = settings.welcomeFlow;
    const guildId = String(interaction.guild_id ?? "");
    const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
    if (action !== "ready") return discordResponse("Unknown welcome action.", { ephemeral: true });
    if (!guildId || !userId) return discordResponse("This button can only be used inside the Discord server.", { ephemeral: true });
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    if (flow.readyRoleId) await addDiscordMemberRole(guildId, userId, flow.readyRoleId, settings);
    recordDiscordDeliverySafe({ status: "sent", eventType: "welcome_ready", summary: "Welcome Ready clicked", metadata: { guildId, userId, roleId: flow.readyRoleId } });
    return discordResponse(flow.readyRoleId ? "You are marked as ready and your access role has been applied." : "You are marked as ready.", { ephemeral: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({ status: "failed", eventType: "welcome_ready", summary: "Welcome ready failed", error: message, metadata: { customId, guildId: interaction.guild_id, userId: interaction.member?.user?.id ?? interaction.user?.id } });
    return discordResponse(`Welcome update failed: ${message}`, { ephemeral: true });
  }
}

async function handleDiscordColourRoleComponent(interaction) {
  const customId = String(interaction.data?.custom_id ?? "");
  try {
    const [, action, colourKey, roleIdRaw = ""] = customId.split(":");
    const settings = getDiscordSettingsRaw();
    const guildId = String(interaction.guild_id ?? "");
    const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
    if (action !== "select") return discordResponse("Unknown colour action.", { ephemeral: true });
    if (!guildId || !userId) return discordResponse("Colour roles can only be changed inside the Discord server.", { ephemeral: true });
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    const roles = await resolvedColourRoles(settings);
    const selected = roles.find((role) => role.key === colourKey && role.roleId === roleIdRaw) ?? roles.find((role) => role.roleId === roleIdRaw);
    if (!selected) return discordResponse("That colour role is no longer configured. Ask an admin to repost the selector.", { ephemeral: true });
    const colourRoleIds = new Set(roles.map((role) => role.roleId));
    const memberRoles = new Set(Array.isArray(interaction.member?.roles) ? interaction.member.roles.map(String) : []);
    for (const roleId of colourRoleIds) {
      if (roleId !== selected.roleId && memberRoles.has(roleId)) await removeDiscordMemberRole(guildId, userId, roleId, settings);
    }
    if (!memberRoles.has(selected.roleId)) await addDiscordMemberRole(guildId, userId, selected.roleId, settings);
    recordDiscordDeliverySafe({
      status: "sent",
      eventType: "colour_role",
      summary: `Set colour role to ${selected.label}`,
      metadata: { guildId, userId, colourKey: selected.key, roleId: selected.roleId, removedRoleIds: [...colourRoleIds].filter((roleId) => roleId !== selected.roleId && memberRoles.has(roleId)) },
    });
    return discordResponse(`Your name colour is now ${selected.label}. Any previous colour role was removed.`, { ephemeral: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDiscordDeliverySafe({ status: "failed", eventType: "colour_role", summary: "Colour role update failed", error: message, metadata: { customId, guildId: interaction.guild_id, userId: interaction.member?.user?.id ?? interaction.user?.id } });
    return discordResponse(`Colour role update failed: ${message}`, { ephemeral: true });
  }
}

async function discordCraftWatchCommand(interaction) {
  const guildId = String(interaction.guild_id ?? "");
  const userId = String(interaction.member?.user?.id ?? interaction.user?.id ?? "");
  if (!guildId || !userId) return discordResponse("Craft watches can only be managed inside a Discord server.", { ephemeral: true });
  const settings = getDiscordSettingsRaw();
  const memberRoles = Array.isArray(interaction.member?.roles) ? new Set(interaction.member.roles.map(String)) : new Set();
  const roleEntries = Object.entries(settings.craftRoles ?? {}).filter(([, roleId]) => String(roleId ?? "").trim());
  const subcommand = discordSubcommand(interaction) || "list";
  if (subcommand === "clear") {
    if (!settings.botToken) return discordResponse("The Discord bot token is not configured, so I cannot update roles yet.", { ephemeral: true });
    const removable = roleEntries.filter(([, roleId]) => memberRoles.has(String(roleId)));
    for (const [, roleId] of removable) await removeDiscordMemberRole(guildId, userId, String(roleId), settings);
    return discordResponse(`Removed ${removable.length.toLocaleString()} craft notification role${removable.length === 1 ? "" : "s"} from you.`, { ephemeral: true });
  }
  const watches = roleEntries.filter(([, roleId]) => memberRoles.has(String(roleId))).map(([key]) => professionLabel(key));
  return discordEmbedResponse(discordCommandEmbed("Craft Watches", "Your personal craft notification roles.", [
    { name: "Watching", value: watches.length ? watches.join(", ") : "None", inline: false },
  ]), { ephemeral: true });
}

async function discordSuppliesCommand() {
  const { claimId } = getSettings();
  const payload = await fetchBitjita(`/claims/${claimId}`);
  const claim = payload.claim ?? payload;
  return discordSupplyEmbed(claim);
}

async function discordOnlineCommand() {
  const { claimId } = getSettings();
  const membersPayload = await fetchBitjita(`/claims/${claimId}/members`);
  const members = unwrap(membersPayload, "members", []);
  const details = await mapWithConcurrency(members.slice(0, 80), 8, async (member) => {
    const playerId = String(member.playerEntityId ?? member.entityId ?? "");
    if (!playerId) return null;
    try {
      const payload = await fetchBitjita(`/players/${playerId}`);
      const player = payload.player ?? payload;
      return { name: player.username ?? member.userName ?? member.username ?? playerId, online: Boolean(player.signedIn ?? player.online) };
    } catch {
      return { name: member.userName ?? member.username ?? playerId, online: false };
    }
  });
  const online = details.filter((entry) => entry?.online);
  return discordCommandEmbed("Members Online", online.length ? `**${online.length}/${members.length}** settlement members are online.` : `No settlement members appear online right now.`, [
    { name: "Online", value: online.length ? online.map((entry) => entry.name).join(", ").slice(0, 1024) : "None", inline: false },
    { name: "Tracked members", value: String(members.length), inline: true },
  ], online.length ? 0x4ee28a : 0x838e9e);
}

async function discordCraftsCommand(skillFilter = "") {
  const { claimId } = getSettings();
  const payload = await fetchBitjita(`/crafts?claimEntityId=${claimId}&completed=false`);
  const filter = skillFilter.trim().toLowerCase();
  const jobs = unwrap(payload, "craftResults", [])
    .filter((job) => !filter || JSON.stringify(job.levelRequirements ?? job.experiencePerProgress ?? "").toLowerCase().includes(filter) || String(job.recipeName ?? "").toLowerCase().includes(filter))
    .slice(0, 8);
  if (!jobs.length) return discordCommandEmbed("Active Crafts", filter ? `No active settlement crafts matched **${skillFilter}**.` : "No active settlement crafts found.", [], 0x838e9e);
  return discordCommandEmbed("Active Crafts", `${jobs.length} craft${jobs.length === 1 ? "" : "s"}${filter ? ` matching **${skillFilter}**` : ""}`, jobs.map((job) => {
    const remaining = toNumber(job.remainingCraftWork ?? job.actionsRemaining ?? job.effortRemaining ?? job.remainingEffort);
    return {
      name: craftDisplayName(job, payload).slice(0, 256),
      value: `${job.buildingName ? `Structure: ${job.buildingName}\n` : ""}${remaining ? `Effort left: ${remaining.toLocaleString()}` : "Effort left: unknown"}`.slice(0, 1024),
      inline: false,
    };
  }), 0x65b7fa);
}

async function discordPriceCommand(itemName, regionOption) {
  const query = itemName.trim();
  if (query.length < 2) throw new Error("Enter an item name.");
  const { claimId } = getSettings();
  const claimPayload = await fetchBitjita(`/claims/${claimId}`).catch(() => ({}));
  const regionId = String(regionOption ?? (claimPayload.claim ?? claimPayload)?.regionId ?? "").trim();
  const searchPayload = await fetchBitjita(`/market?search=${encodeURIComponent(query)}`);
  const item = unwrap(searchPayload, "items", []).find((candidate) => String(candidate.name ?? candidate.itemName ?? "").toLowerCase() === query.toLowerCase()) ?? unwrap(searchPayload, "items", [])[0];
  if (!item) return discordCommandEmbed("Price Finder", `No market item found for **${query}**.`, [], 0x838e9e);
  const itemId = item.id ?? item.itemId;
  const itemType = item.itemType ?? item.type ?? 0;
  const historyPath = `/market/items/${encodeURIComponent(String(itemId))}/price-history?bucket=1%20day&limit=30${regionId ? `&regionId=${encodeURIComponent(regionId)}` : ""}`;
  const history = await fetchBitjita(historyPath);
  const buckets = unwrap(history, "buckets", []);
  const avg = (days) => {
    const selected = buckets.slice(-days).filter((bucket) => toNumber(bucket.quantity ?? bucket.unitsSold ?? bucket.volume));
    const totalValue = selected.reduce((sum, bucket) => sum + toNumber(bucket.totalPrice ?? bucket.totalValue ?? bucket.value), 0);
    const quantity = selected.reduce((sum, bucket) => sum + toNumber(bucket.quantity ?? bucket.unitsSold ?? bucket.volume), 0);
    return quantity ? Math.round(totalValue / quantity) : 0;
  };
  const a1 = avg(1);
  const a7 = avg(7);
  const a30 = avg(30);
  const suggested = a7 || a30 || a1;
  return discordCommandEmbed("Price Finder", `**${item.name ?? item.itemName}**${regionId ? ` pricing in **R${regionId}**` : ""}`, [
    { name: "24h average", value: a1 ? formatGold(a1) : "No sales", inline: true },
    { name: "7d average", value: a7 ? formatGold(a7) : "No sales", inline: true },
    { name: "30d average", value: a30 ? formatGold(a30) : "No sales", inline: true },
    { name: "Suggested list price", value: suggested ? formatGold(suggested) : "Not enough sales data", inline: false },
    { name: "Item type", value: String(itemType), inline: true },
  ], suggested ? 0xf0c64f : 0x838e9e);
}

async function registerDiscordCommands() {
  const settings = getDiscordSettingsRaw();
  if (!settings.botToken || !settings.applicationId) throw new Error("Discord bot token and application ID are required");
  const route = settings.guildId
    ? `/applications/${settings.applicationId}/guilds/${settings.guildId}/commands`
    : `/applications/${settings.applicationId}/commands`;
  const response = await fetch(`https://discord.com/api/v10${route}`, {
    method: "PUT",
    headers: { authorization: `Bot ${settings.botToken}`, "content-type": "application/json" },
    body: JSON.stringify(registeredDiscordCommands()),
  });
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return response.json();
}

async function serveBuiltFrontend(url, method, res) {
  if (!serveFrontend || !["GET", "HEAD"].includes(method ?? "")) return false;
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const assetPath = path.resolve(distDir, requestedPath);
  const isDistPath = assetPath === distDir || assetPath.startsWith(`${distDir}${path.sep}`);
  const candidate = isDistPath && existsSync(assetPath) && statSync(assetPath).isFile() ? assetPath : path.join(distDir, "index.html");
  if (!existsSync(candidate)) {
    send(res, 503, { error: "Frontend build is missing. Run the production build before starting the server." });
    return true;
  }
  const content = await readFile(candidate);
  res.writeHead(200, securityHeaders({
    "content-type": mimeType(candidate),
    "cache-control": staticCacheControl(candidate),
  }));
  if (method === "HEAD") return res.end();
  res.end(content);
  return true;
}

async function proxyBitjita(req, url, res) {
  // Browser pages call this local proxy instead of bitjita.com directly. The
  // proxy centralises CORS avoidance, upstream caching, and rate limiting while
  // preserving the old page-driven "fetch fresh data while viewing a page" model.
  const upstream = new URL(process.env.BITJITA_API_ORIGIN ?? "https://bitjita.com");
  upstream.pathname = `/api/${url.pathname.slice("/api/bitjita/".length)}`;
  upstream.search = url.search;
  if (!bitjitaProxyCache.hasFreshCache(upstream) && !bitjitaProxyCache.hasInflight(upstream) && !rateLimit(req, res, "proxy", RATE_LIMITS.proxy)) return;
  const response = await bitjitaProxyCache.fetchUpstreamCached(upstream);
  res.writeHead(response.status, securityHeaders({ ...response.headers, "x-bitjita-cache": response.cacheState, ...(response.stale ? { "x-bitjita-stale": "1", warning: '110 - "Response is stale because BitJita is currently unavailable"' } : {}) }));
  res.end(response.body);
}

const server = createServer(async (req, res) => {
  try {
    // Route order matters: public health/proxy/config endpoints are handled
    // before authenticated admin routes, while static frontend fallback stays at
    // the end so API typos do not accidentally return index.html.
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const requestStartedAt = Date.now();
    let requestFinished = false;
    res.once("finish", () => {
      requestFinished = true;
      const durationMs = Date.now() - requestStartedAt;
      if (!isTestRuntime && durationMs >= SLOW_REQUEST_LOG_MS) {
        console.warn(`Slow request completed: ${req.method} ${url.pathname}${url.search} status=${res.statusCode} durationMs=${durationMs}`);
      }
    });
    res.once("close", () => {
      if (requestFinished || isTestRuntime) return;
      const durationMs = Date.now() - requestStartedAt;
      console.warn(`Request connection closed before completion: ${req.method} ${url.pathname}${url.search} durationMs=${durationMs}`);
    });
    if (shouldLogVisitor(url.pathname)) {
      res.once("finish", () => {
        try {
          recordVisitorSecurityEvent(req, url.pathname, res.statusCode);
        } catch (error) {
          if (!isTestRuntime) console.warn(`Visitor security logging failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    }
    if (req.method === "OPTIONS") return send(res, 204, {});
    if (req.method === "GET" && url.pathname === "/api/local/health") return send(res, 200, { ok: true, polling: collectorStatusPayload() });
    if (req.method === "GET" && url.pathname === "/api/local/collector-status") return send(res, 200, collectorStatusPayload());
    if (req.method === "GET" && url.pathname.startsWith("/api/bitjita/")) {
      return proxyBitjita(req, url, res);
    }
    if (req.method === "GET" && url.pathname === "/api/local/config") return send(res, 200, getSettings());
    if (req.method === "GET" && url.pathname === "/api/local/popups") return send(res, 200, { popups: publicPopups(appPopupConfig()) });
    if (req.method === "GET" && url.pathname === "/api/local/recipe-detail") {
      try {
        const kind = String(url.searchParams.get("kind") ?? "items") === "cargo" ? "cargo" : "items";
        const id = String(url.searchParams.get("id") ?? "").trim();
        if (!/^\d+$/.test(id)) return send(res, 400, { error: "Recipe item id is required" });
        const cached = statements.getRecipeCatalogEntry.get(recipeCatalogKey(kind, id));
        if (!cached && !rateLimit(req, res, "recipe-detail", RATE_LIMITS.expensiveLocal)) return;
        const target = {
          id,
          kind,
          itemType: kind === "cargo" ? 1 : 0,
          name: url.searchParams.get("name") ?? undefined,
          tier: url.searchParams.get("tier") ?? undefined,
          rarity: url.searchParams.get("rarity") ?? undefined,
          tag: url.searchParams.get("tag") ?? undefined,
          iconAssetName: url.searchParams.get("iconAssetName") ?? undefined,
        };
        return send(res, 200, await recipeDetailFromCatalogOrFetch(target));
      } catch (error) {
        return send(res, error?.statusCode ?? 502, { error: error instanceof Error ? error.message : "Unable to load recipe detail" });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/auth/me") return send(res, 200, authStatus(req));
    if (req.method === "GET" && url.pathname === "/api/local/auth/discord/start") {
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      return handleDiscordOAuthStart(req, res, url);
    }
    if (req.method === "GET" && url.pathname === "/api/local/auth/discord/callback") {
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      return handleDiscordOAuthCallback(req, res, url);
    }
    if (req.method === "POST" && url.pathname === "/api/local/auth/logout") {
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin sign-out rejected" });
      return send(res, 200, { ok: true, user: null, discordLoginEnabled: discordOAuthConfig(req).enabled }, { "set-cookie": clearAppUserSession(req) });
    }
    if (req.method === "PUT" && url.pathname === "/api/local/auth/character") {
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      const user = requireAppUser(req, res);
      if (!user) return;
      const body = await readJson(req, BODY_LIMITS.auth);
      const characterPlayerId = String(body.characterPlayerId ?? "").trim();
      const characterName = String(body.characterName ?? "").trim();
      if (!characterPlayerId && !characterName) {
        statements.updateUserCharacter.run("", "", "unlinked", user.id);
        return send(res, 200, { user: publicAppUser(getAppUser(req)) });
      }
      if (String(user.character_status ?? "") === "approved" && String(user.character_player_id ?? "") && String(user.character_player_id) !== characterPlayerId) {
        return send(res, 409, { error: "Unlink your approved character before linking a different one" });
      }
      if (!/^\d{8,}$/.test(characterPlayerId)) return send(res, 400, { error: "Choose a valid BitCraft character" });
      if (!characterName || characterName.length > 80) return send(res, 400, { error: "Character name is required" });
      statements.updateUserCharacter.run(characterPlayerId, characterName, "pending", user.id);
      const updatedUser = getAppUser(req);
      void sendDiscordCharacterLinkRequest(updatedUser, { characterPlayerId, characterName });
      return send(res, 200, { user: publicAppUser(updatedUser) });
    }
    if (req.method === "PUT" && url.pathname === "/api/local/auth/settings") {
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      const user = requireAppUser(req, res);
      if (!user) return;
      const body = await readJson(req, BODY_LIMITS.settings);
      const raw = JSON.stringify(body.settings && typeof body.settings === "object" && !Array.isArray(body.settings) ? body.settings : {});
      if (raw.length > 50000) return send(res, 413, { error: "Saved settings are too large" });
      statements.updateUserSettings.run(raw, user.id);
      return send(res, 200, { user: publicAppUser(getAppUser(req)) });
    }
    if (req.method === "POST" && url.pathname === "/api/discord/interactions") {
      if (!rateLimit(req, res, "discord-interaction", RATE_LIMITS.discordInteraction)) return;
      const result = await handleDiscordInteraction(req);
      return send(res, result.status, result.body);
    }
    if (req.method === "POST" && url.pathname === "/api/local/analytics/event") {
      if (!rateLimit(req, res, "analytics", RATE_LIMITS.analytics)) return;
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin analytics event rejected" });
      try {
        return send(res, 201, recordAnalyticsEvent(await readJson(req, BODY_LIMITS.analytics), req));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return send(res, error?.statusCode ?? (message === "Analytics consent is required" ? 403 : 400), { error: message });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/region/claims") {
      if (!rateLimit(req, res, "region-claims", RATE_LIMITS.expensiveLocal)) return;
      const regionId = String(url.searchParams.get("regionId") ?? "").trim();
      if (!/^\d+$/.test(regionId)) return send(res, 400, { error: "Region id is required" });
      return send(res, 200, await fetchCachedRegionClaims(regionId));
    }
    if (req.method === "GET" && url.pathname === "/api/local/regions/active") {
      if (!rateLimit(req, res, "regions-active", RATE_LIMITS.expensiveLocal)) return;
      const include = parseRegionIds(url.searchParams.get("include"));
      return send(res, 200, await fetchCachedActiveRegions(include));
    }
    if (req.method === "GET" && url.pathname === "/api/local/map/catalog") {
      if (!rateLimit(req, res, "map-catalog", RATE_LIMITS.expensiveLocal)) return;
      return send(res, 200, await fetchMapCatalog());
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/local/branding/")) {
      const type = url.pathname.slice("/api/local/branding/".length);
      const asset = brandingAsset(type);
      if (!asset) return send(res, 404, { error: "Brand asset not configured" });
      return sendBinary(res, 200, await readFile(asset.filePath), asset.contentType);
    }
    if (req.method === "GET" && url.pathname === "/api/local/admin/me") return send(res, 200, adminStatus(req));
    if (req.method === "POST" && url.pathname === "/api/local/admin/setup") {
      if (!legacyAdminPasswordAuth) return send(res, 410, { error: "Password administrator setup has been replaced by Discord administrator access" });
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin administrator setup rejected" });
      if (toNumber(statements.adminCount.get()?.count) > 0) return send(res, 409, { error: "Admin user already exists" });
      const body = await readJson(req, BODY_LIMITS.auth);
      if (isProduction && !adminSetupKey) return send(res, 503, { error: "Admin setup is disabled until ADMIN_SETUP_KEY is configured on the server" });
      if (isProduction && String(body.setupKey ?? "") !== adminSetupKey) return send(res, 403, { error: "Invalid server setup key" });
      const username = String(body.username ?? "admin").trim();
      if (!validAdminUsername(username)) return send(res, 400, { error: "Username must be 3-32 letters, numbers, underscores or hyphens" });
      const password = String(body.password ?? "");
      if (!validLegacyAdminPassword(password)) return send(res, 400, { error: "Password must be at least 12 characters" });
      const createdAt = new Date().toISOString();
      const result = statements.insertAdmin.run(username, await hashPassword(password), "owner", createdAt);
      statements.updateLastLogin.run(createdAt, result.lastInsertRowid);
      audit({ id: result.lastInsertRowid, username }, "admin.setup", { username });
      const session = createSession(result.lastInsertRowid);
      return send(res, 200, adminStatus({ headers: { cookie: session.cookie } }), { "set-cookie": session.cookie });
    }
    if (req.method === "POST" && url.pathname === "/api/local/admin/login") {
      if (!legacyAdminPasswordAuth) return send(res, 410, { error: "Administrator sign-in now uses Discord. Sign in with an approved Discord admin account." });
      if (!rateLimit(req, res, "auth", RATE_LIMITS.auth)) return;
      if (!sameOriginRequest(req)) return send(res, 403, { error: "Cross-origin administrator sign-in rejected" });
      const body = await readJson(req, BODY_LIMITS.auth);
      const username = String(body.username ?? "admin").trim();
      const attemptKey = loginAttemptKey(requestAddress(req), username);
      if (adminLoginAttempts.blocked(attemptKey)) return send(res, 429, { error: "Too many failed sign-in attempts. Try again in 15 minutes." });
      const user = statements.adminByUsername.get(username);
      const successful = Boolean(user && await verifyPassword(String(body.password ?? ""), user.password_hash));
      statements.insertLoginEvent.run(username, successful ? 1 : 0, new Date().toISOString(), requestAddress(req));
      if (!successful) {
        adminLoginAttempts.recordFailure(attemptKey);
        return send(res, 401, { error: "Invalid username or password" });
      }
      adminLoginAttempts.clear(attemptKey);
      statements.updateLastLogin.run(new Date().toISOString(), user.id);
      audit(user, "admin.login");
      const session = createSession(user.id);
      return send(res, 200, adminStatus({ headers: { cookie: session.cookie } }), { "set-cookie": session.cookie });
    }
    if (req.method === "POST" && url.pathname === "/api/local/admin/logout") {
      const user = requireAdmin(req, res);
      if (!user || !requireAdminMutation(req, res, user)) return;
      audit(user, "admin.logout");
      return send(res, 200, { ok: true }, { "set-cookie": clearSession(req) });
    }
    if (url.pathname.startsWith("/api/local/admin/")) {
      const user = requireAdmin(req, res);
      if (!user) return;
      if (!requireAdminMutation(req, res, user)) return;
      const requiredPermission = adminPermissionFor(req.method, url.pathname);
      if (!requireAdminPermission(req, res, user, requiredPermission)) return;
      if (req.method === "GET" && url.pathname === "/api/local/admin/status") return send(res, 200, databaseStatus());
      if (req.method === "GET" && url.pathname === "/api/local/admin/jobs") return send(res, 200, scheduledJobsStatus());
      if (req.method === "PUT" && url.pathname === "/api/local/admin/jobs") {
        const body = await readJson(req, BODY_LIMITS.json);
        const key = String(body.key ?? "").trim();
        if (!scheduledJobRegistry[key]) return send(res, 404, { error: "Unknown scheduled job" });
        const row = statements.getScheduledJob.get(key);
        if (!row) return send(res, 404, { error: "Scheduled job is not configured" });
        const enabled = body.enabled === false ? 0 : 1;
        if (body.scheduleConfig && typeof body.scheduleConfig === "object") {
          const schedule = serializeScheduledJobSchedule(body.scheduleConfig);
          const updatedAt = new Date().toISOString();
          statements.updateScheduledJobSettings.run(schedule, enabled, nextScheduledRunIso(schedule), updatedAt, key);
          audit(user, "scheduled_job.update", { key, enabled: Boolean(enabled), schedule });
        } else {
          statements.setScheduledJobEnabled.run(enabled, new Date().toISOString(), key);
          audit(user, "scheduled_job.toggle", { key, enabled: Boolean(enabled) });
        }
        return send(res, 200, scheduledJobsStatus());
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/jobs/run") {
        const body = await readJson(req, BODY_LIMITS.json);
        const key = String(body.key ?? "").trim();
        recoverStaleScheduledJobs();
        if (!scheduledJobRegistry[key]) return send(res, 404, { error: "Unknown scheduled job", ...scheduledJobsStatus() });
        const row = statements.getScheduledJob.get(key);
        if (!row) return send(res, 404, { error: "Scheduled job is not configured", ...scheduledJobsStatus() });
        if (row.running) return send(res, 409, { error: "Scheduled job is already running", ...scheduledJobsStatus() });
        audit(user, "scheduled_job.run_started", { key });
        void runScheduledJob(key, { manual: true })
          .then((result) => audit(user, "scheduled_job.run_completed", { key, metadata: result.metadata }))
          .catch((error) => console.warn(`Manual scheduled job ${key} failed: ${error instanceof Error ? error.message : String(error)}`));
        return send(res, 202, { ...scheduledJobsStatus(), result: { ok: true, key, started: true } });
      }
      if (req.method === "POST" && (url.pathname === "/api/local/admin/poll" || url.pathname === "/api/local/admin/collect-now")) {
        await collectServerSnapshot(true);
        audit(user, url.pathname.endsWith("/collect-now") ? "data.collect_now" : "data.poll");
        return send(res, 200, { ...databaseStatus(), collectorStatus: collectorStatusPayload() });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/diagnostics") {
        const checks = await apiDiagnostics();
        audit(user, "diagnostics.run", { failures: checks.filter((check) => !check.ok).length });
        return send(res, 200, { checks });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/register-commands") {
        const commands = await registerDiscordCommands();
        audit(user, "discord.register_commands", { count: Array.isArray(commands) ? commands.length : 0 });
        return send(res, 200, { commands });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/youtube") return send(res, 200, discordYouTubeStatus());
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/youtube/channels") {
        const body = await readJson(req, BODY_LIMITS.settings);
        const result = await addDiscordYouTubeChannel(body.input ?? body.url ?? body.channelId);
        audit(user, "discord.youtube_channel.add", { channelId: result.added?.channelId, input: body.input ?? body.url ?? body.channelId, seededVideos: result.seededVideos });
        return send(res, 200, result);
      }
      if (req.method === "PUT" && url.pathname === "/api/local/admin/discord/youtube/channels") {
        const body = await readJson(req, BODY_LIMITS.settings);
        const channelId = String(body.channelId ?? "").trim();
        if (!channelId) return send(res, 400, { error: "YouTube channel ID is required" });
        const now = new Date().toISOString();
        const patch = { channelId };
        if (Object.prototype.hasOwnProperty.call(body, "enabled")) {
          statements.setDiscordYouTubeChannelEnabled.run(body.enabled === false ? 0 : 1, now, channelId);
          patch.enabled = body.enabled !== false;
        }
        if (Object.prototype.hasOwnProperty.call(body, "discordChannelId")) {
          const discordChannelId = String(body.discordChannelId ?? "").trim();
          if (discordChannelId && !validDiscordId(discordChannelId)) return send(res, 400, { error: "Discord channel ID is invalid" });
          statements.setDiscordYouTubeChannelDiscordChannel.run(discordChannelId, now, channelId);
          patch.discordChannelId = discordChannelId;
        }
        audit(user, "discord.youtube_channel.update", patch);
        return send(res, 200, discordYouTubeStatus());
      }
      if (req.method === "DELETE" && url.pathname === "/api/local/admin/discord/youtube/channels") {
        const channelId = String(url.searchParams.get("channelId") ?? "").trim();
        if (!channelId) return send(res, 400, { error: "YouTube channel ID is required" });
        statements.deleteDiscordYouTubeVideosForChannel.run(channelId);
        statements.deleteDiscordYouTubeChannel.run(channelId);
        audit(user, "discord.youtube_channel.delete", { channelId });
        return send(res, 200, discordYouTubeStatus());
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/youtube/check") {
        const body = await readJson(req, BODY_LIMITS.settings);
        const channelId = String(body.channelId ?? "").trim();
        const result = await runYouTubeChannelMonitorJob({ manual: true, channelId });
        audit(user, "discord.youtube_channel.check", { channelId, checked: result.checked, notified: result.notified });
        return send(res, 200, discordYouTubeStatus({ result }));
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/discovery") {
        const discovery = await discordGuildDiscovery();
        audit(user, "discord.discovery", { channels: discovery.channels.length, roles: discovery.roles.length, members: discovery.memberCount });
        return send(res, 200, discovery);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/test") {
        const body = await readJson(req);
        const kind = String(body.kind ?? "basic");
        const result = await sendDiscordTestNotification(kind);
        audit(user, "discord.test_message", { kind, status: result?.skipped ? "skipped" : "sent" });
        return send(res, 200, { ok: true, result });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/colour-roles/post") {
        const response = await postDiscordColourSelector();
        audit(user, "discord.colour_roles_post", { messageId: response?.id });
        return send(res, 200, { ok: true, response });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/colour-roles/manage") {
        const body = await readJson(req).catch(() => ({}));
        const current = getDiscordSettingsRaw();
        const result = await manageDiscordColourRoles({ ...current, ...body, colourRoles: Array.isArray(body.colourRoles) ? body.colourRoles : current.colourRoles });
        audit(user, "discord.colour_roles_manage", { count: result.roles.length, anchorRole: result.anchorRole?.name ?? null });
        return send(res, 200, { ok: true, ...result, settings: getSettings() });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/roles/create") {
        const body = await readJson(req);
        const role = await createDiscordRoleFromAdmin(body);
        audit(user, "discord.role_create", { roleId: role?.id, name: body.name ?? body.roleName });
        return send(res, 201, { ok: true, role });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/role-panel/post") {
        const body = await readJson(req);
        const result = await postDiscordRolePanel(String(body.panelKey ?? ""));
        audit(user, "discord.role_panel_post", { panelKey: result.panel.key, messageId: result.response?.id, action: result.action });
        return send(res, 200, { ok: true, ...result, settings: getSettings() });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/welcome/post") {
        const result = await postDiscordWelcomeFlow();
        audit(user, "discord.welcome_post", { messageId: result.response?.id, action: result.action });
        return send(res, 200, { ok: true, ...result, settings: getSettings() });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/audit-log") return send(res, 200, await discordAuditLogReport());
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/role-cleanup") return send(res, 200, await discordRoleCleanupReport());
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/channel-permissions") return send(res, 200, await discordChannelPermissionReport());
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/inactive-report") {
        const body = await readJson(req).catch(() => ({}));
        return send(res, 200, await discordInactiveMemberReport(toNumber(body.days) || 30));
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/announcement") {
        const body = await readJson(req);
        const response = await sendDiscordAnnouncement(body);
        audit(user, "discord.announcement", { channelId: body.channelId, messageId: response?.id });
        return send(res, 200, { ok: true, response });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/pinned-info") {
        const body = await readJson(req);
        const result = await updateDiscordPinnedInfo(body);
        audit(user, "discord.pinned_info", { channelId: body.channelId, messageId: result.response?.id, action: result.action });
        return send(res, 200, { ok: true, ...result });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/scheduled-event") {
        const body = await readJson(req);
        const response = await createDiscordScheduledEvent(body);
        audit(user, "discord.scheduled_event", { eventId: response?.id, name: body.name });
        return send(res, 200, { ok: true, response });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/moderation/bans") return send(res, 200, await discordModerationBans());
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/timeout") {
        const body = await readJson(req);
        const result = await discordModerationTimeout(body);
        audit(user, "discord.moderation_timeout", { userId: result.userId, minutes: result.minutes });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/kick") {
        const body = await readJson(req);
        const result = await discordModerationKick(body);
        audit(user, "discord.moderation_kick", { userId: result.userId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/ban") {
        const body = await readJson(req);
        const result = await discordModerationBan(body);
        audit(user, "discord.moderation_ban", { userId: result.userId, deleteMessageSeconds: result.deleteMessageSeconds });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/unban") {
        const body = await readJson(req);
        const result = await discordModerationUnban(body);
        audit(user, "discord.moderation_unban", { userId: result.userId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/purge") {
        const body = await readJson(req);
        const result = await discordModerationPurge(body);
        audit(user, "discord.moderation_purge", { channelId: result.channelId, requested: result.requested, deleted: result.deleted });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/temp-ban") {
        const body = await readJson(req);
        const result = await discordTemporaryBan(body);
        audit(user, "discord.moderation_temp_ban", { userId: result.userId, hours: result.hours, unbanAt: result.unbanAt });
        return send(res, 200, result);
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/moderation/cases") return send(res, 200, discordCaseLog(url.searchParams.get("limit") ?? 80));
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/warnings") {
        const body = await readJson(req);
        const result = await discordWarningCreate(body, user.username);
        audit(user, "discord.warning_create", { userId: body.userId, warningId: result.warningId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/warnings/list") return send(res, 200, discordWarnings(await readJson(req)));
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/warnings/clear") {
        const body = await readJson(req);
        const result = discordWarningsClear(body, user.username);
        audit(user, "discord.warning_clear", { userId: body.userId, cleared: result.cleared });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/notes") {
        const body = await readJson(req);
        const result = discordModNoteCreate(body, user.username);
        audit(user, "discord.mod_note_create", { userId: body.userId, noteId: result.noteId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/notes/list") return send(res, 200, discordModNotes(await readJson(req)));
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/slowmode") {
        const result = await discordSlowmode(await readJson(req));
        audit(user, "discord.slowmode", { channelId: result.channelId, seconds: result.seconds });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/lockdown") {
        const result = await discordLockdown(await readJson(req));
        audit(user, result.locked ? "discord.lockdown" : "discord.unlock", { channelId: result.channelId });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/automod") {
        const result = await syncDiscordAutoModeration(await readJson(req));
        audit(user, "discord.automod_create", { ruleId: result.rule?.id });
        return send(res, 200, result);
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/moderation/automod") return send(res, 200, await discordNativeAutoModerationRules());
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/nickname-report") return send(res, 200, await discordNicknameReport(await readJson(req)));
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/moderation/profile") return send(res, 200, await discordMemberProfile(await readJson(req)));
      if (req.method === "GET" && url.pathname === "/api/local/admin/discord/custom-commands") return send(res, 200, discordCustomCommands());
      if (req.method === "PUT" && url.pathname === "/api/local/admin/discord/custom-commands") {
        const result = upsertDiscordCustomCommand(await readJson(req));
        audit(user, "discord.custom_command_upsert", { name: result.command.name });
        return send(res, 200, result);
      }
      if (req.method === "DELETE" && url.pathname === "/api/local/admin/discord/custom-commands") {
        const name = normalizeCommandName(url.searchParams.get("name"));
        statements.deleteDiscordCustomCommand.run(name);
        audit(user, "discord.custom_command_delete", { name });
        return send(res, 200, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/poll") {
        const result = await postDiscordPoll(await readJson(req));
        audit(user, "discord.poll_post", { messageId: result.response?.id });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/rsvp") {
        const result = await postDiscordRsvp(await readJson(req));
        audit(user, "discord.rsvp_post", { messageId: result.response?.id });
        return send(res, 200, result);
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/discord/embed") {
        const result = await sendDiscordCleanEmbed(await readJson(req));
        audit(user, "discord.embed_post", { messageId: result.response?.id });
        return send(res, 200, result);
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/popups") return send(res, 200, appPopupConfig());
      if (req.method === "PUT" && url.pathname === "/api/local/admin/popups") {
        const updatedAt = new Date().toISOString();
        const config = normalizePopupConfig(await readJson(req, BODY_LIMITS.settings), { defaultUpdatedAt: updatedAt });
        statements.upsertSetting.run("app_popups_json", JSON.stringify(config), updatedAt);
        audit(user, "popups.update", { count: config.popups.length, enabledCount: publicPopups(config).length });
        return send(res, 200, appPopupConfig());
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/settings") return send(res, 200, getSettings());
      if (req.method === "PUT" && url.pathname === "/api/local/admin/settings") {
        const body = await readJson(req, BODY_LIMITS.settings);
        const nextClaimId = String(body.claimId ?? "").trim();
        const nextSyncUrl = String(body.syncUrl ?? defaultSyncUrl).trim();
        if (!validClaimId(nextClaimId)) return send(res, 400, { error: "Settlement ID must be a numeric BitCraft claim id" });
        if (!validBitcraftSyncUrl(nextSyncUrl)) return send(res, 400, { error: "BitCraft Sync URL must be a https://bitcraftsync.app link" });
        const refreshSeconds = Number(body.refreshSeconds ?? 30);
        if (!validRefreshIntervalSeconds(refreshSeconds)) return send(res, 400, { error: "Display refresh interval must be between 15 and 300 seconds" });
        const serverRefreshSeconds = Number(body.serverRefreshSeconds ?? refreshSeconds);
        if (!validRefreshIntervalSeconds(serverRefreshSeconds)) return send(res, 400, { error: "Server collection interval must be between 15 and 300 seconds" });
        const collectorSettings = normalizeCollectorSettings(body.collectorSettings ?? {});
        const defaultPage = String(body.defaultPage ?? DEFAULT_APP_PAGE);
        if (!validAppPage(defaultPage)) return send(res, 400, { error: "Unknown default page" });
        const defaultRegion = String(body.defaultRegion ?? "").trim();
        if (defaultRegion && !validRegionId(defaultRegion)) return send(res, 400, { error: "Default region must be numeric or blank" });
        const additionalActiveRegions = parseRegionIds(body.additionalActiveRegions).join(",");
        if (String(body.additionalActiveRegions ?? "").trim() && !additionalActiveRegions) return send(res, 400, { error: "Additional active regions must be numeric IDs separated by commas or spaces" });
        const excludedMemberIds = normalizeSubmittedExcludedMemberIds(body.excludedMemberIds);
        const snapshotRetentionDays = Number(body.snapshotRetentionDays ?? 365);
        if (!validSnapshotRetentionDays(snapshotRetentionDays)) return send(res, 400, { error: "Retention must be between 30 and 3650 days" });
        const previousVisitorSecurity = visitorSecuritySettings(true);
        const visitorSecurity = normalizeVisitorSecuritySettings(body.visitorSecurity ?? {}, {
          includeSecrets: true,
          previous: previousVisitorSecurity,
          clearLicenseKey: body.visitorSecurity?.geoipClearLicenseKey === true,
        });
        if (visitorSecurity.geoipSourceUrl && !/^https?:\/\//i.test(visitorSecurity.geoipSourceUrl)) return send(res, 400, { error: "GeoIP source URL must start with http:// or https://" });
        const nextTheme = { ...defaultTheme, ...(body.theme ?? {}) };
        const toastSettings = {
          marketListings: body.toastSettings?.marketListings !== false,
          marketSales: body.toastSettings?.marketSales !== false,
          production: body.toastSettings?.production !== false,
        };
        const marketDealWatch = normalizeMarketDealWatchSettings(body.marketDealWatch ?? {});
        const discordSettings = normalizeDiscordSettings(body.discord ?? {});
        const discordToken = String(body.discord?.botToken ?? "").trim();
        if (discordSettings.enabled) {
          if (!discordSettings.applicationId) return send(res, 400, { error: "Discord application ID is required when Discord is enabled" });
          if (!discordSettings.publicKey) return send(res, 400, { error: "Discord public key is required when Discord is enabled" });
          if (!discordSettings.channelId) return send(res, 400, { error: "Discord channel ID is required when Discord is enabled" });
        }
        const updatedAt = new Date().toISOString();
        statements.upsertSetting.run("claim_id", nextClaimId, updatedAt);
        statements.upsertSetting.run("bitcraft_sync_url", nextSyncUrl, updatedAt);
        statements.upsertSetting.run("theme_json", JSON.stringify(nextTheme), updatedAt);
        statements.upsertSetting.run("refresh_seconds", String(refreshSeconds), updatedAt);
        statements.upsertSetting.run("server_refresh_seconds", String(serverRefreshSeconds), updatedAt);
        statements.upsertSetting.run("collector_settings_json", JSON.stringify(collectorSettings), updatedAt);
        statements.upsertSetting.run("default_page", defaultPage, updatedAt);
        statements.upsertSetting.run("default_region", defaultRegion, updatedAt);
        statements.upsertSetting.run("active_region_overrides", additionalActiveRegions, updatedAt);
        statements.upsertSetting.run("excluded_member_ids_json", JSON.stringify(excludedMemberIds), updatedAt);
        statements.upsertSetting.run("snapshot_retention_days", String(snapshotRetentionDays), updatedAt);
        statements.upsertSetting.run("visitor_security_json", JSON.stringify(visitorSecurity), updatedAt);
        statements.upsertSetting.run("toast_json", JSON.stringify(toastSettings), updatedAt);
        statements.upsertSetting.run("market_deal_watch_json", JSON.stringify(marketDealWatch), updatedAt);
        statements.upsertSetting.run("discord_json", JSON.stringify(discordSettings), updatedAt);
        const youtubePollSeconds = Math.max(60, Math.round(toNumber(discordSettings.youtube?.pollIntervalMinutes) * 60) || 600);
        const youtubeSchedule = `interval@${youtubePollSeconds}`;
        const youtubeJob = statements.getScheduledJob.get("youtube_channel_monitor");
        if (youtubeJob) statements.updateScheduledJobSettings.run(youtubeSchedule, youtubeJob.enabled === 0 ? 0 : 1, nextScheduledRunIso(youtubeSchedule), updatedAt, "youtube_channel_monitor");
        if (discordToken) statements.upsertSecret.run("discord_bot_token", discordToken, updatedAt);
        if (body.discord?.clearBotToken === true) statements.deleteSecret.run("discord_bot_token");
        activeRegionsCache = null;
        pollStatus.intervalMs = serverRefreshSeconds * 1000;
        scheduleServerPolling(serverRefreshSeconds * 1000);
        refreshCollectorStatusSettings();
        audit(user, "settings.update", { claimId: nextClaimId, refreshSeconds, serverRefreshSeconds, collectorCount: Object.keys(collectorSettings).length, defaultPage, defaultRegion, additionalActiveRegions, excludedMemberCount: excludedMemberIds.length, snapshotRetentionDays, visitorSecurity: { fullIpRetentionDays: visitorSecurity.fullIpRetentionDays, statsRetentionDays: visitorSecurity.statsRetentionDays, geoipProvider: visitorSecurity.geoipProvider, geoipConfigured: visitorSecurity.geoipProvider === "ipapi" || Boolean(visitorSecurity.geoipSourceUrl) }, discordEnabled: discordSettings.enabled });
        startDiscordGateway();
        void announceDiscordAppUpdateIfNeeded().catch((error) => console.warn(`Discord app update announcement failed: ${error instanceof Error ? error.message : String(error)}`));
        return send(res, 200, getSettings());
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/branding") {
        const body = await readJson(req, BODY_LIMITS.branding);
        try {
          const branding = await saveBrandingAsset(String(body.type ?? ""), String(body.dataUrl ?? ""));
          audit(user, "branding.upload", { type: body.type });
          return send(res, 200, { branding });
        } catch (error) {
          return send(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
      }
      if (req.method === "DELETE" && url.pathname === "/api/local/admin/branding") {
        const type = String(url.searchParams.get("type") ?? "");
        if (!["logo", "favicon"].includes(type)) return send(res, 400, { error: "Unknown branding asset type" });
        const asset = brandingAsset(type);
        if (asset) unlinkSync(asset.filePath);
        const branding = { ...getSettings().branding };
        delete branding[type];
        statements.upsertSetting.run("branding_json", JSON.stringify(branding), new Date().toISOString());
        audit(user, "branding.delete", { type });
        return send(res, 200, { branding });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/users") {
        const users = db.prepare(`
          SELECT admin_users.id, admin_users.username, admin_users.role, admin_users.active, admin_users.created_at, admin_users.last_login_at,
                 admin_users.discord_id, admin_users.discord_username, admin_users.discord_global_name, admin_users.discord_avatar,
                 COUNT(admin_sessions.token_hash) AS sessions
          FROM admin_users LEFT JOIN admin_sessions ON admin_sessions.user_id = admin_users.id AND admin_sessions.expires_at > ?
          GROUP BY admin_users.id ORDER BY admin_users.username
        `).all(new Date().toISOString());
        return send(res, 200, { users: users.map((entry) => ({ ...entry, role: normalizeAdminRole(entry.role), roleLabel: ADMIN_ROLE_LABELS[normalizeAdminRole(entry.role)], avatarUrl: discordAvatarUrl(entry) })), roles: ADMIN_ROLE_LABELS });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/user-accounts") {
        return send(res, 200, { accounts: statements.listUserAccounts.all().map(publicAppUser) });
      }
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user-accounts/approval") {
        const body = await readJson(req);
        const userId = Number(body.userId);
        const status = String(body.status ?? "");
        if (!userId || !["pending", "approved", "rejected", "unlinked"].includes(status)) return send(res, 400, { error: "Choose an account and a valid link status" });
        const target = db.prepare("SELECT * FROM user_accounts WHERE id = ?").get(userId);
        if (!target) return send(res, 404, { error: "Linked account not found" });
        statements.updateUserCharacterStatus.run(status, userId);
        audit(user, "linked_account.approval", { userId, discordId: target.discord_id, characterName: target.character_name, status });
        return send(res, 200, { accounts: statements.listUserAccounts.all().map(publicAppUser) });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/users") {
        const body = await readJson(req);
        const discordId = String(body.discordId ?? "").trim();
        const displayName = String(body.displayName ?? body.username ?? "").trim();
        const username = displayName || `Discord ${discordId}`;
        const password = String(body.password ?? "");
        const role = normalizeAdminRole(body.role ?? "admin");
        if (role === "owner" && normalizeAdminRole(user.role) !== "owner") return send(res, 403, { error: "Only owners can create owner administrators" });
        if (legacyAdminPasswordAuth && !discordId) {
          if (!validAdminUsername(username)) return send(res, 400, { error: "Username must be 3-32 letters, numbers, underscores or hyphens" });
          if (!validLegacyAdminPassword(password)) return send(res, 400, { error: "Password must be at least 12 characters" });
          try {
            const result = statements.insertAdmin.run(username, await hashPassword(password), role, new Date().toISOString());
            audit(user, "user.create", { id: result.lastInsertRowid, username, role });
            return send(res, 201, { ok: true });
          } catch (error) {
            if (String(error).includes("UNIQUE")) return send(res, 409, { error: "That username is already in use" });
            throw error;
          }
        }
        if (!validDiscordId(discordId)) return send(res, 400, { error: "Enter a valid Discord user ID" });
        if (username.length < 2 || username.length > 80) return send(res, 400, { error: "Display name must be between 2 and 80 characters" });
        try {
          const result = statements.insertDiscordAdmin.run(username, "discord-oauth-admin", role, new Date().toISOString(), discordId, "", username, "");
          audit(user, "user.create", { id: result.lastInsertRowid, username, discordId, role });
          return send(res, 201, { ok: true });
        } catch (error) {
          if (String(error).includes("UNIQUE")) return send(res, 409, { error: "That Discord account is already an administrator" });
          throw error;
        }
      }
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user/password") {
        if (!legacyAdminPasswordAuth) return send(res, 410, { error: "Administrator passwords have been replaced by Discord sign-in" });
        const body = await readJson(req);
        const userId = Number(body.userId);
        const password = String(body.password ?? "");
        if (!userId || !validLegacyAdminPassword(password)) return send(res, 400, { error: "Select a user and enter a password of at least 12 characters" });
        const target = db.prepare("SELECT id, username FROM admin_users WHERE id = ?").get(userId);
        if (!target) return send(res, 404, { error: "Admin user not found" });
        statements.updatePassword.run(await hashPassword(password), userId);
        statements.deleteUserSessions.run(userId);
        audit(user, "user.password_reset", { id: target.id, username: target.username });
        return send(res, 200, { ok: true, signedOut: userId === user.id });
      }
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user/status") {
        const body = await readJson(req);
        const userId = Number(body.userId);
        const active = Boolean(body.active);
        if (userId === user.id && !active) return send(res, 400, { error: "You cannot disable your current account" });
        const target = db.prepare("SELECT id, username FROM admin_users WHERE id = ?").get(userId);
        if (!target) return send(res, 404, { error: "Admin user not found" });
        statements.updateAdminActive.run(active ? 1 : 0, userId);
        if (!active) statements.deleteUserSessions.run(userId);
        audit(user, "user.status", { id: target.id, username: target.username, active });
        return send(res, 200, { ok: true });
      }
      if (req.method === "PUT" && url.pathname === "/api/local/admin/user/role") {
        const body = await readJson(req);
        const userId = Number(body.userId);
        const role = normalizeAdminRole(body.role);
        if (!userId) return send(res, 400, { error: "Select an administrator and role" });
        if (userId === user.id && role !== "owner") return send(res, 400, { error: "You cannot remove owner access from your current account" });
        const target = db.prepare("SELECT id, username, role FROM admin_users WHERE id = ?").get(userId);
        if (!target) return send(res, 404, { error: "Admin user not found" });
        statements.updateAdminRole.run(role, userId);
        statements.deleteUserSessions.run(userId);
        audit(user, "user.role", { id: target.id, username: target.username, previousRole: normalizeAdminRole(target.role), role });
        return send(res, 200, { ok: true, signedOut: userId === user.id });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/sessions/clear") {
        const body = await readJson(req);
        const userId = Number(body.userId ?? user.id);
        if (userId === user.id) {
          const token = sessionTokenFromRequest(req, ADMIN_SESSION_COOKIE_NAME);
          if (token) statements.deleteOtherSessions.run(user.id, sessionTokenHash(token));
        } else {
          statements.deleteUserSessions.run(userId);
        }
        audit(user, "sessions.clear", { userId });
        return send(res, 200, { ok: true });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/audit") {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 100), 1), 500);
        const auditLog = db.prepare("SELECT * FROM admin_audit_log ORDER BY occurred_at DESC, id DESC LIMIT ?").all(limit);
        const logins = db.prepare("SELECT * FROM admin_login_events ORDER BY occurred_at DESC, id DESC LIMIT ?").all(Math.min(limit, 100));
        return send(res, 200, { auditLog, logins });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/analytics") {
        return send(res, 200, analyticsDashboard(url.searchParams.get("days")));
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/visitor-security") {
        return send(res, 200, visitorSecurityDashboard(url.searchParams));
      }
      if (req.method === "DELETE" && url.pathname === "/api/local/admin/analytics") {
        const removed = db.prepare("DELETE FROM analytics_events").run().changes;
        audit(user, "analytics.clear", { removed });
        return send(res, 200, { removed });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/tables") return send(res, 200, { tables: tableInfo() });
      if (req.method === "GET" && url.pathname === "/api/local/admin/table") {
        const table = url.searchParams.get("name") ?? "";
        return send(res, 200, tableQuery(table, Object.fromEntries(url.searchParams.entries())));
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/export") {
        const name = url.searchParams.get("name") ?? "";
        const format = url.searchParams.get("format") === "json" ? "json" : "csv";
        const result = tableQuery(name, Object.fromEntries(url.searchParams.entries()), true);
        if (format === "json") {
          return sendText(res, 200, JSON.stringify(result.rows, null, 2), "application/json; charset=utf-8", { "content-disposition": `attachment; filename="${name}.json"` });
        }
        const csv = [result.columns.map(csvValue).join(","), ...result.rows.map((row) => result.columns.map((column) => csvValue(row[column])).join(","))].join("\n");
        return sendText(res, 200, csv, "text/csv; charset=utf-8", { "content-disposition": `attachment; filename="${name}.csv"` });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/backups") return send(res, 200, { backups: backupNames() });
      if (req.method === "POST" && url.pathname === "/api/local/admin/backups") {
        const backup = createBackup();
        audit(user, "backup.create", backup);
        return send(res, 201, { backup });
      }
      if (req.method === "GET" && url.pathname === "/api/local/admin/backup") {
        const name = path.basename(String(url.searchParams.get("name") ?? ""));
        const backup = backupNames().find((entry) => entry.name === name);
        if (!backup) return send(res, 404, { error: "Backup not found" });
        return sendBinary(res, 200, await readFile(path.join(backupDir, name)), "application/vnd.sqlite3", { "content-disposition": `attachment; filename="${name}"` });
      }
      if (req.method === "POST" && url.pathname === "/api/local/admin/maintenance/prune") {
        const retentionDays = getSettings().snapshotRetentionDays;
        const before = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
        const result = db.prepare("DELETE FROM snapshots WHERE captured_at < ?").run(before);
        audit(user, "maintenance.prune", { retentionDays, removed: result.changes });
        return send(res, 200, { removed: result.changes, before });
      }
    }
    if (req.method === "POST" && url.pathname === "/api/local/snapshot") {
      if (!rateLimit(req, res, "local-snapshot", RATE_LIMITS.expensiveLocal)) return;
      if (isProduction) return send(res, 403, { error: "Browser snapshot collection is disabled in production" });
      return send(res, 200, await enqueueSnapshot(await readJson(req, BODY_LIMITS.snapshot)));
    }
    if (url.pathname === "/api/local/market/deal-watches") {
      const appUser = requireAppUser(req, res);
      if (!appUser) return;
      const claimId = String(url.searchParams.get("claimId") ?? getSettings().claimId ?? "").trim();
      if (req.method === "GET") {
        const watches = statements.listDealWatchesForUser.all(appUser.id, claimId).map(dealWatchRow);
        return send(res, 200, { watches, settings: getSettings().marketDealWatch });
      }
      if (req.method === "POST") {
        const body = await readJson(req, BODY_LIMITS.json);
        const dealSettings = getSettings().marketDealWatch;
        const count = toNumber(statements.dealWatchCountForUser.get(appUser.id, claimId)?.count);
        if (count >= dealSettings.maxWatchesPerUser) return send(res, 409, { error: `Watch limit reached (${dealSettings.maxWatchesPerUser})` });
        const regionId = String(body.regionId ?? "").trim();
        const itemId = String(body.itemId ?? "").trim();
        const itemType = String(body.itemType ?? 0).trim() || "0";
        const itemName = String(body.itemName ?? "").trim();
        if (!/^\d+$/.test(regionId)) return send(res, 400, { error: "Choose a single region before watching an item" });
        if (!itemId || !itemName) return send(res, 400, { error: "Item details are required" });
        if (statements.dealWatchByUserItem.get(appUser.id, claimId, regionId, itemId, itemType)) return send(res, 409, { error: "This item is already on your deal watchlist for that region" });
        const nowIso = new Date().toISOString();
        const threshold = Math.min(Math.max(toNumber(body.thresholdPercent) || dealSettings.thresholdPercent, 1), 95);
        const result = statements.insertDealWatch.run(
          appUser.id,
          String(appUser.discord_id ?? ""),
          claimId,
          regionId,
          itemId,
          itemType,
          itemName,
          body.tier == null ? null : toNumber(body.tier),
          body.rarity == null ? null : String(body.rarity),
          body.iconAssetName == null ? null : String(body.iconAssetName),
          threshold,
          nowIso,
          nowIso,
        );
        return send(res, 201, { watch: dealWatchRow(statements.dealWatchByIdForUser.get(result.lastInsertRowid, appUser.id)) });
      }
    }
    if (url.pathname.startsWith("/api/local/market/deal-watches/")) {
      const appUser = requireAppUser(req, res);
      if (!appUser) return;
      const id = Number(url.pathname.split("/").at(-1));
      if (!Number.isFinite(id)) return send(res, 400, { error: "Invalid watch id" });
      if (req.method === "PATCH") {
        const body = await readJson(req, BODY_LIMITS.json);
        const enabled = typeof body.enabled === "boolean" ? (body.enabled ? 1 : 0) : null;
        const threshold = body.thresholdPercent == null ? null : Math.min(Math.max(toNumber(body.thresholdPercent), 1), 95);
        statements.updateDealWatch.run(enabled, threshold, new Date().toISOString(), id, appUser.id);
        const row = statements.dealWatchByIdForUser.get(id, appUser.id);
        if (!row) return send(res, 404, { error: "Watch not found" });
        return send(res, 200, { watch: dealWatchRow(row) });
      }
      if (req.method === "DELETE") {
        const result = statements.deleteDealWatch.run(id, appUser.id);
        if (!result.changes) return send(res, 404, { error: "Watch not found" });
        return send(res, 200, { ok: true });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/market/deal-alerts") {
      const appUser = requireAppUser(req, res);
      if (!appUser) return;
      const limit = Math.min(Math.max(toNumber(url.searchParams.get("limit")) || 50, 1), 100);
      return send(res, 200, {
        alerts: statements.listDealAlertsForUser.all(appUser.id, limit).map(publicDealAlertRow),
        unread: toNumber(statements.unreadDealAlertCount.get(appUser.id)?.count),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/local/empires") {
      if (!rateLimit(req, res, "empires", RATE_LIMITS.expensiveLocal)) return;
      const regionId = String(url.searchParams.get("regionId") ?? "").trim();
      if (!/^\d+$/.test(regionId)) return send(res, 400, { error: "Region id is required" });
      try {
        return send(res, 200, await regionalEmpireOverview(regionId));
      } catch (error) {
        const cached = empireCacheGetAny(`overview:${regionId}`);
        if (cached) return send(res, 200, { ...cached, stale: true, partial: true, errors: [...(cached.errors ?? []), errorMessage(error)] });
        return send(res, 200, {
          regionId,
          fetchedAt: new Date().toISOString(),
          stale: true,
          partial: true,
          totalRegionalClaims: 0,
          empireClaimCount: 0,
          empires: [],
          errors: [errorMessage(error)],
          summary: { empires: 0, regionalClaims: 0, totalMembers: 0, largestEmpireName: null },
        });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/empires/watchtowers") {
      if (!rateLimit(req, res, "empire-watchtowers", RATE_LIMITS.expensiveLocal)) return;
      const regionId = String(url.searchParams.get("regionId") ?? "").trim();
      if (!/^\d+$/.test(regionId)) return send(res, 400, { error: "Region id is required" });
      const inactiveDays = url.searchParams.get("inactiveDays") ?? 14;
      try {
        return send(res, 200, await regionalEmpireWatchtowers(regionId, inactiveDays));
      } catch (error) {
        const days = Math.max(1, Math.min(365, toNumber(inactiveDays) || 14));
        const cached = empireCacheGetAny(`watchtowers:${regionId}:${days}`);
        if (cached) return send(res, 200, { ...cached, stale: true, errors: [...(cached.errors ?? []), errorMessage(error)] });
        return send(res, 200, {
          regionId,
          inactiveDays: days,
          fetchedAt: new Date().toISOString(),
          stale: true,
          partial: true,
          unclaimedAvailable: false,
          unclaimedMessage: "Unclaimed watchtowers are not exposed by the current BitJita public API.",
          empires: [],
          towers: [],
          errors: [errorMessage(error)],
          summary: { towerCount: 0, inactiveRiskEmpires: 0, underSiege: 0, activeTowers: 0 },
        });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/market/history") {
      return send(res, 200, marketHistory(url.searchParams.get("claimId") ?? "", Number(url.searchParams.get("limit") ?? 100), url.searchParams.get("owner") ?? ""));
    }
    if (req.method === "GET" && url.pathname === "/api/local/market/buy-orders") {
      return send(res, 200, marketBuyOrders(url.searchParams.get("claimId") ?? getSettings().claimId, Object.fromEntries(url.searchParams.entries())));
    }
    if (req.method === "GET" && url.pathname === "/api/local/leaderboard") {
      return send(res, 200, contributionLeaderboard(url.searchParams.get("claimId") ?? ""));
    }
    if (req.method === "POST" && url.pathname === "/api/local/passive-crafts") {
      if (!rateLimit(req, res, "passive-crafts", RATE_LIMITS.expensiveLocal)) return;
      return send(res, 200, await passiveCraftSummaries(await readJson(req, BODY_LIMITS.json)));
    }
    if (req.method === "POST" && url.pathname === "/api/local/player-details") {
      if (!rateLimit(req, res, "player-details", RATE_LIMITS.expensiveLocal)) return;
      return send(res, 200, await playerDetailSummaries(await readJson(req, BODY_LIMITS.json)));
    }
    if (req.method === "POST" && url.pathname === "/api/local/production/crafts") {
      if (!rateLimit(req, res, "production-crafts", RATE_LIMITS.expensiveLocal)) return;
      return send(res, 200, await settlementProductionCrafts(await readJson(req, BODY_LIMITS.json)));
    }
    if (req.method === "GET" && url.pathname === "/api/local/dashboard-data") {
      if (!rateLimit(req, res, "dashboard-data", RATE_LIMITS.expensiveLocal)) return;
      try {
        return send(res, 200, await dashboardData(url.searchParams.get("claimId") ?? ""));
      } catch (error) {
        return send(res, error?.statusCode ?? 500, { error: error instanceof Error ? error.message : "Unable to load dashboard data" });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/local/history") {
      const include = String(url.searchParams.get("include") ?? "").split(",").map((part) => part.trim()).filter(Boolean);
      const allowed = new Set(["market", "activity", "snapshots", "dashboard"]);
      const sections = include.length ? new Set(include.filter((part) => allowed.has(part))) : null;
      return send(res, 200, localHistory(url.searchParams.get("claimId") ?? "", sections, {
        activityLimit: Number(url.searchParams.get("activityLimit") ?? 2000),
      }));
    }
    if (req.method === "GET" && url.pathname === "/api/local/snapshots") {
      const claimId = url.searchParams.get("claimId") ?? "";
      return send(res, 200, snapshotHistory(claimId, {
        limit: Number(url.searchParams.get("limit") ?? 96),
        daily: url.searchParams.get("daily") === "1",
        days: Number(url.searchParams.get("days") ?? 7),
      }));
    }
    if (req.method === "POST" && url.pathname === "/api/local/market/event/resolve") {
      if (isProduction) {
        const user = requireAdmin(req, res);
        if (!user || !requireAdminMutation(req, res, user)) return;
      }
      return send(res, 200, resolveMarketEvent(await readJson(req, BODY_LIMITS.json)));
    }
    if (req.method === "GET" && url.pathname === "/api/local/activity") {
      const claimId = url.searchParams.get("claimId") ?? "";
      const query = url.searchParams.get("q") ?? "";
      return send(res, 200, query.trim()
        ? activitySearch(claimId, query, Number(url.searchParams.get("limit") ?? 500))
        : activityHistory(claimId, Number(url.searchParams.get("limit") ?? 500)));
    }
    if (req.method === "GET" && url.pathname === "/api/local/notification-activity") {
      const claimId = url.searchParams.get("claimId") ?? "";
      return send(res, 200, notificationActivity(claimId, Number(url.searchParams.get("limit") ?? 120)));
    }
    if (!url.pathname.startsWith("/api/") && await serveBuiltFrontend(url, req.method, res)) return;
    send(res, 404, { error: "Not found" });
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    if (!isTestRuntime) {
      const detail = error instanceof Error && error.stack ? error.stack : errorMessage(error);
      console.warn(`Request failed: ${req.method} ${req.url ?? "/"} status=${status} ${detail}`);
    }
    if (res.headersSent) return res.end();
    send(res, status, { error: error instanceof Error ? error.message : String(error) });
  }
});

const port = Number(process.env.APP_PORT ?? process.env.LOCAL_API_PORT ?? 18430);
const host = process.env.APP_HOST ?? "127.0.0.1";
let serverPollTimer = null;

function scheduleServerPolling(delayMs = 0) {
  if (!serverPollingEnabled) return;
  if (serverPollTimer) clearTimeout(serverPollTimer);
  const intervalMs = serverRefreshIntervalMs();
  pollStatus.intervalMs = intervalMs;
  pollStatus.nextRunAt = new Date(Date.now() + delayMs).toISOString();
  for (const key of Object.keys(pollStatus.collectors)) {
    setCollectorStatus(key, { nextRunAt: pollStatus.nextRunAt });
  }
  serverPollTimer = setTimeout(async () => {
    try {
      await collectServerSnapshot();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      pollStatus.lastAttemptAt = new Date().toISOString();
      pollStatus.lastError = message;
      if (!isTestRuntime) console.warn(`Server snapshot polling failed: ${message}`);
    } finally {
      scheduleServerPolling(serverRefreshIntervalMs());
    }
  }, delayMs);
}

function startBackgroundTasks() {
  startDiscordGateway();
  void processDiscordNotificationOutbox().catch((error) => console.warn(`Discord notification outbox failed: ${error instanceof Error ? error.message : String(error)}`));
  setInterval(processDiscordNotificationOutbox, discordNotificationOutboxIntervalMs);
  setTimeout(() => {
    void announceDiscordAppUpdateIfNeeded().catch((error) => console.warn(`Discord app update announcement failed: ${error instanceof Error ? error.message : String(error)}`));
  }, 5000);
  if (serverPollingEnabled) {
    console.log(`Server snapshot polling enabled every ${serverRefreshIntervalMs() / 1000} seconds`);
    scheduleServerPolling(0);
  }
  if (scheduledJobsEnabled && !isTestRuntime) {
    console.log("Scheduled jobs enabled; checking every 60 seconds");
    checkScheduledJobs();
    setInterval(checkScheduledJobs, 60 * 1000);
  }
}

if (processRoleConfig.serveHttp) {
  server.listen(port, host, () => {
    console.log(`BitCraft monitor server listening on http://${host}:${port}${serveFrontend ? " with production frontend" : ""} role=${processRole}`);
    if (processRoleConfig.runBackgroundJobs) startBackgroundTasks();
  });
} else {
  console.log(`BitCraft monitor worker started role=${processRole}`);
  startBackgroundTasks();
}

