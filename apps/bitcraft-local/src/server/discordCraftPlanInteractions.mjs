import {
  discordCraftPlanCommandAllowed,
  normalizeCraftPlanReportProfession,
} from "./craftPlanDiscordReports.mjs";

function interactionOption(interaction, name) {
  return interaction?.data?.options?.find((option) => option.name === name)?.value;
}

export function preflightCraftPlanInteraction(interaction = {}, configuredRoleId = "") {
  if (!discordCraftPlanCommandAllowed(interaction.member ?? {}, configuredRoleId)) {
    return {
      ok: false,
      error: configuredRoleId
        ? "You need the configured Craft Planner report role to use this command."
        : "Craft Planner report command access has not been configured yet.",
    };
  }
  const requested = String(interactionOption(interaction, "profession") ?? "");
  const profession = requested ? normalizeCraftPlanReportProfession(requested) : "";
  if (requested && !profession) return { ok: false, error: "That profession is not available." };
  return { ok: true, profession };
}

export function deferredDiscordInteractionResult(afterResponse) {
  return {
    body: {
      type: 5,
      data: { allowed_mentions: { parse: [] } },
    },
    afterResponse,
  };
}

export function runDiscordTaskAfterResponse(response, task) {
  return new Promise((resolve, reject) => {
    response.once("finish", () => {
      void Promise.resolve().then(task).then(resolve, reject);
    });
  });
}

export function craftPlanInteractionDiagnostic({ report = {}, profession = "", durationMs = 0, response } = {}) {
  const calculationFailed = Boolean(report.calculationError);
  return {
    status: calculationFailed ? "failed" : "sent",
    eventType: "craft_plan_command",
    summary: report.title || "On-demand Craft Planner report",
    reason: "On-demand Craft Planner report",
    ...(calculationFailed ? { error: report.calculationError } : {}),
    metadata: {
      profession: profession || "overview",
      durationMs,
      deliveryOutcome: calculationFailed ? "unavailable_report_sent" : "report_sent",
    },
    response: { id: response?.id, channel_id: response?.channel_id },
  };
}

export async function editDiscordInteractionOriginal({
  applicationId,
  interactionToken,
  data,
  fetchImpl = fetch,
} = {}) {
  const appId = String(applicationId ?? "").trim();
  const token = String(interactionToken ?? "").trim();
  if (!appId || !token) throw new Error("Discord interaction webhook context is unavailable");
  let response;
  try {
    response = await fetchImpl(
      `https://discord.com/api/v10/webhooks/${encodeURIComponent(appId)}/${encodeURIComponent(token)}/messages/@original`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(data ?? {}), allowed_mentions: { parse: [] } }),
      },
    );
  } catch {
    throw new Error("Discord interaction webhook request failed");
  }
  if (!response.ok) throw new Error(`Discord interaction webhook HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
