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

export async function editDiscordInteractionOriginal({
  applicationId,
  interactionToken,
  data,
  fetchImpl = fetch,
} = {}) {
  const appId = String(applicationId ?? "").trim();
  const token = String(interactionToken ?? "").trim();
  if (!appId || !token) throw new Error("Discord interaction webhook context is unavailable");
  const response = await fetchImpl(
    `https://discord.com/api/v10/webhooks/${encodeURIComponent(appId)}/${encodeURIComponent(token)}/messages/@original`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(data ?? {}), allowed_mentions: { parse: [] } }),
    },
  );
  if (!response.ok) throw new Error(`Discord interaction webhook HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
