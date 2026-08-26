export type AdminConditionSeverity = "action" | "degraded" | "healthy";

export function classifyAdminCondition(condition: {
  configured?: boolean;
  ok?: boolean;
  critical?: boolean;
  optional?: boolean;
  localDevelopment?: boolean;
}): AdminConditionSeverity {
  if (condition.ok) return "healthy";
  if (condition.localDevelopment || condition.optional || condition.configured === false) return "degraded";
  return condition.critical || condition.configured ? "action" : "degraded";
}

export function scheduledJobTimingLabel(job: { nextRunAt?: unknown }, schedulerEnabled: boolean): string {
  if (!schedulerEnabled) return "Not scheduled while disabled";
  if (!job.nextRunAt) return "Not scheduled";
  const date = new Date(String(job.nextRunAt));
  return Number.isNaN(date.getTime()) ? "Not scheduled" : date.toLocaleString();
}
