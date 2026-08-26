import {
  isCompletedProductionJob,
  normalizeProductionJob,
} from "./productionActivity.mjs";

function safeJson(value, fallback = {}) {
  try {
    return JSON.parse(String(value ?? ""));
  } catch {
    return fallback;
  }
}

function unwrap(payload, key, fallback) {
  if (Array.isArray(payload)) return payload;
  return payload?.[key] ?? payload?.data?.[key] ?? fallback;
}

export function recordProductionJobs({
  statements,
  claimId,
  craftsPayload,
  occurredAt,
  missingGraceMs,
  now = Date.now,
  diagnosticContext,
  notificationSkipReason,
  isStartAgeGateSkip,
}) {
  const observations = unwrap(craftsPayload, "craftResults", []).map((raw) => ({
    completed: raw?.completed === true,
    job: normalizeProductionJob(raw, craftsPayload),
  }));
  const jobs = observations.filter(({ completed }) => !completed).map(({ job }) => job);
  const explicitlyCompleted = new Set(
    observations.filter(({ completed }) => completed).map(({ job }) => job.key),
  );
  const seen = new Set(jobs.map((job) => job.key));
  const activeRows = statements.activeProductionJobs.all(claimId);
  const existing = new Map(activeRows.map((row) => [row.job_key, row]));
  const existingByStableKey = new Map(
    activeRows.map((row) => [normalizeProductionJob(safeJson(row.raw_json)).key, row]),
  );
  const hasProductionBaseline = Number(statements.productionJobCount.get(claimId)?.count ?? 0) > 0;
  const pendingNotifications = [];
  const diagnostics = [{
    status: "debug",
    eventType: "production_poll",
    summary: `Production poll saw ${jobs.length} active craft${jobs.length === 1 ? "" : "s"}`,
    reason: hasProductionBaseline
      ? "Production baseline exists"
      : "First production baseline; start notifications are suppressed for this poll",
    metadata: diagnosticContext("production_started", {
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
    if (!current && isCompletedProductionJob(job)) {
      diagnostics.push({
        status: "skipped",
        eventType: "production_started",
        summary: `Craft already complete when first observed: ${job.label}`,
        reason: "Newly observed craft is already complete or ready to collect; start notification suppressed",
        metadata: diagnosticContext("production_started", jobWithTiming),
      });
      continue;
    }
    statements.upsertProductionJob.run(
      job.key,
      claimId,
      job.label,
      job.buildingName,
      job.crafterName,
      firstSeen,
      occurredAt,
      JSON.stringify(jobWithTiming),
    );
    const startAlreadyNotified = current ? Boolean(current.start_notified) : false;
    if (startAlreadyNotified) {
      diagnostics.push({
        status: "debug",
        eventType: "production_started",
        summary: `Craft start already notified: ${job.label}`,
        reason: "Existing active craft row already has start_notified=1",
        metadata: diagnosticContext("production_started", {
          ...jobWithTiming,
          existingFirstSeen: current.first_seen,
          existingLastSeen: current.last_seen,
        }),
      });
    }
    if (!startAlreadyNotified && hasProductionBaseline) {
      const summary = `Craft started: ${job.label}`;
      const sourceKey = `production_started:${job.key}`;
      statements.insertSourcedActivity.run(
        claimId,
        "production_started",
        summary,
        occurredAt,
        JSON.stringify(jobWithTiming),
        sourceKey,
      );
      const skipReason = notificationSkipReason("production_started", jobWithTiming);
      const retryWhenOlder = isStartAgeGateSkip(skipReason);
      if (skipReason) {
        diagnostics.push({
          status: "skipped",
          eventType: "production_started",
          summary,
          reason: skipReason,
          metadata: diagnosticContext("production_started", jobWithTiming),
        });
      } else {
        pendingNotifications.push({
          jobKey: job.key,
          sourceKey,
          eventType: "production_started",
          summary,
          occurredAt,
          metadata: jobWithTiming,
        });
      }
      if (!retryWhenOlder) statements.markProductionStartNotified.run(job.key);
    }
  }

  for (const [key, current] of existing) {
    if (seen.has(key)) continue;
    const lastSeenMs = new Date(String(current.last_seen ?? "")).getTime();
    if (
      !explicitlyCompleted.has(key)
      && Number.isFinite(lastSeenMs)
      && now() - lastSeenMs < missingGraceMs
    ) {
      diagnostics.push({
        status: "debug",
        eventType: "production_completed",
        summary: `Craft missing briefly: ${current.label}`,
        reason: `Craft has been absent for less than ${Math.round(missingGraceMs / 1000)} seconds; completion is delayed to avoid duplicate start notifications from transient API gaps`,
        metadata: diagnosticContext("production_completed", {
          key,
          label: current.label,
          buildingName: current.building_name,
          crafterName: current.crafter_name,
          lastSeen: current.last_seen,
        }),
      });
      continue;
    }
    statements.completeProductionJob.run(occurredAt, key);
    const job = {
      ...normalizeProductionJob(safeJson(current.raw_json)),
      key,
      label: current.label,
      buildingName: current.building_name,
      crafterName: current.crafter_name,
    };
    const metadata = {
      key,
      label: current.label,
      buildingName: current.building_name,
      crafterName: current.crafter_name,
      ...job,
    };
    const summary = `Craft completed: ${current.label}`;
    const sourceKey = `production_completed:${key}`;
    statements.insertSourcedActivity.run(
      claimId,
      "production_completed",
      summary,
      occurredAt,
      JSON.stringify(metadata),
      sourceKey,
    );
    const skipReason = notificationSkipReason("production_completed", metadata);
    if (skipReason) {
      diagnostics.push({
        status: "skipped",
        eventType: "production_completed",
        summary,
        reason: skipReason,
        metadata: diagnosticContext("production_completed", metadata),
      });
    } else {
      pendingNotifications.push({
        jobKey: key,
        sourceKey,
        eventType: "production_completed",
        summary,
        occurredAt,
        metadata,
      });
    }
  }
  return { pendingNotifications, diagnostics };
}
