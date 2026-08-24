import type { BotSection } from "./botSectionState";

export type BotHealthTone = "neutral" | "success" | "warning" | "danger";
export type BotHealthInput = {
  enabled: boolean;
  tokenConfigured: boolean;
  gatewayConnected: boolean;
  gatewayError: string | null;
  rulesEnabled: number;
  lastDeliveryStatus: string | null;
  lastDeliveryLabel: string;
  setupSteps: Array<{ label: string; detail: string; done: boolean; section: BotSection }>;
};
export type BotHealthCard = { id: "gateway" | "rules" | "token" | "delivery"; label: string; value: string; detail: string; tone: BotHealthTone };
export type BotException = { id: string; title: string; detail: string; tone: "warning" | "danger"; section: BotSection; actionLabel: string };

export function deriveBotHealth(input: BotHealthInput): { cards: BotHealthCard[]; exceptions: BotException[] } {
  if (!input.enabled) return {
    cards: [
      { id: "gateway", label: "Gateway", value: "Inactive", detail: "Bot is disabled", tone: "neutral" },
      { id: "rules", label: "Rules", value: String(input.rulesEnabled), detail: "Configured notification rules", tone: "neutral" },
      { id: "token", label: "Token", value: input.tokenConfigured ? "Configured" : "Not configured", detail: "Inactive while disabled", tone: "neutral" },
      { id: "delivery", label: "Delivery", value: "Inactive", detail: input.lastDeliveryLabel, tone: "neutral" },
    ],
    exceptions: [],
  };
  const deliveryFailed = /failed|error/i.test(input.lastDeliveryStatus ?? "");
  const deliverySucceeded = /^(sent|delivered|success|succeeded)$/i.test(input.lastDeliveryStatus ?? "");
  const deliveryPending = /^(pending|queued|partial)$/i.test(input.lastDeliveryStatus ?? "");
  const exceptions: BotException[] = [];
  if (!input.tokenConfigured) exceptions.push({ id: "token", title: "Bot token is missing", detail: "Add a token before the gateway can connect.", tone: "danger", section: "setup", actionLabel: "Open setup" });
  else if (input.gatewayError) exceptions.push({ id: "gateway", title: "Discord gateway needs attention", detail: input.gatewayError, tone: "danger", section: "setup", actionLabel: "Review connection" });
  if (deliveryFailed) exceptions.push({ id: "delivery", title: "Latest delivery failed", detail: input.lastDeliveryLabel, tone: "danger", section: "diagnostics", actionLabel: "Open diagnostics" });
  for (const step of input.setupSteps.filter(({ done }) => !done)) {
    if (exceptions.some(({ section }) => section === step.section)) continue;
    exceptions.push({ id: `step:${step.label}`, title: step.label, detail: step.detail, tone: "warning", section: step.section, actionLabel: "Continue setup" });
  }
  return {
    cards: [
      { id: "gateway", label: "Gateway", value: input.gatewayConnected ? "Connected" : "Disconnected", detail: input.gatewayError ?? (input.gatewayConnected ? "Live Discord session" : "Waiting for connection"), tone: input.gatewayConnected ? "success" : "danger" },
      { id: "rules", label: "Rules", value: String(input.rulesEnabled), detail: "Notification categories enabled", tone: input.rulesEnabled > 0 ? "success" : "warning" },
      { id: "token", label: "Token", value: input.tokenConfigured ? "Configured" : "Missing", detail: input.tokenConfigured ? "Secret is stored securely" : "Required for delivery", tone: input.tokenConfigured ? "success" : "danger" },
      { id: "delivery", label: "Delivery", value: input.lastDeliveryStatus ?? "No delivery", detail: input.lastDeliveryLabel, tone: deliveryFailed ? "danger" : deliverySucceeded ? "success" : deliveryPending ? "warning" : "neutral" },
    ],
    exceptions,
  };
}
