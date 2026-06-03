import React from "react";
import { Bell } from "lucide-react";

type DiscordSettings = Record<string, any>;

function StatusInfo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function DiscordNotificationsSection({
  channelSelect,
  discord,
  discordDeliveryLabel,
  updateDiscord,
  updateDiscordNotify,
}: {
  channelSelect: (key: string, value: string, professionChannel?: boolean) => React.ReactNode;
  discord: DiscordSettings;
  discordDeliveryLabel: string;
  updateDiscord: (patch: Partial<DiscordSettings>) => void;
  updateDiscordNotify: (key: string, value: boolean) => void;
}) {
  return (
    <section className="form-card discord-preview-card">
      <h3>
        <Bell size={17} /> Notifications
      </h3>
      <div className="discord-rule-grid">
        <div className="discord-rule-card discord-rule-market">
          <h4>Market</h4>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={discord.notify.marketListings}
              onChange={(event) => updateDiscordNotify("marketListings", event.target.checked)}
            />
            <span>New listings</span>
          </label>
          <label className="field">
            <span>Listings channel</span>
            {channelSelect("marketListings", discord.notificationChannels.marketListings)}
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={discord.notify.marketSales}
              onChange={(event) => updateDiscordNotify("marketSales", event.target.checked)}
            />
            <span>Confirmed sales</span>
          </label>
          <label className="field">
            <span>Sales channel</span>
            {channelSelect("marketSales", discord.notificationChannels.marketSales)}
          </label>
          <label className="field">
            <span>Minimum sale value</span>
            <input
              type="number"
              min={0}
              value={discord.minSaleValue}
              onChange={(event) => updateDiscord({ minSaleValue: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="discord-rule-card discord-rule-crafts">
          <h4>Crafts</h4>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={discord.notify.production}
              onChange={(event) => updateDiscordNotify("production", event.target.checked)}
            />
            <span>Enable craft alerts</span>
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={discord.notify.productionStarted}
              onChange={(event) => updateDiscordNotify("productionStarted", event.target.checked)}
            />
            <span>Craft started</span>
          </label>
          <label className="field">
            <span>Started channel</span>
            {channelSelect("productionStarted", discord.notificationChannels.productionStarted, true)}
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={discord.notify.productionCompleted}
              onChange={(event) => updateDiscordNotify("productionCompleted", event.target.checked)}
            />
            <span>Craft completed</span>
          </label>
          <label className="field">
            <span>Completed channel</span>
            {channelSelect("productionCompleted", discord.notificationChannels.productionCompleted, true)}
          </label>
          <label className="field">
            <span>Minimum total XP</span>
            <input
              type="number"
              min={0}
              value={discord.productionMinXp}
              onChange={(event) => updateDiscord({ productionMinXp: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>Start delay (minutes)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={discord.productionMinAgeMinutes}
              onChange={(event) => updateDiscord({ productionMinAgeMinutes: Number(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>Allowed crafters</span>
            <input
              value={discord.productionUsers}
              onChange={(event) => updateDiscord({ productionUsers: event.target.value })}
              placeholder="Blank allows all, or comma separate usernames"
            />
          </label>
        </div>
        <div className="discord-rule-card discord-rule-supplies">
          <h4>Supplies</h4>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={discord.notify.lowSupplies}
              onChange={(event) => updateDiscordNotify("lowSupplies", event.target.checked)}
            />
            <span>Low supply alert</span>
          </label>
          <label className="field">
            <span>Low supplies channel</span>
            {channelSelect("lowSupplies", discord.notificationChannels.lowSupplies)}
          </label>
          <label className="field">
            <span>Runway threshold (days)</span>
            <input
              type="number"
              min={0.25}
              step={0.25}
              value={discord.supplyRunwayDaysThreshold}
              onChange={(event) => updateDiscord({ supplyRunwayDaysThreshold: Number(event.target.value) })}
            />
          </label>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={discord.notify.supplyReports}
              onChange={(event) => updateDiscordNotify("supplyReports", event.target.checked)}
            />
            <span>Scheduled report</span>
          </label>
          <label className="field">
            <span>Report channel</span>
            {channelSelect("supplyReport", discord.notificationChannels.supplyReport)}
          </label>
          <label className="field">
            <span>Report interval (days)</span>
            <input
              type="number"
              min={1}
              step={1}
              value={discord.supplyReportIntervalDays}
              onChange={(event) => updateDiscord({ supplyReportIntervalDays: Number(event.target.value) })}
            />
          </label>
        </div>
        <div className="discord-rule-card discord-rule-application">
          <h4>Application</h4>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={discord.notify.appUpdates}
              onChange={(event) => updateDiscordNotify("appUpdates", event.target.checked)}
            />
            <span>App update announcements</span>
          </label>
          <label className="field">
            <span>Updates channel</span>
            {channelSelect("appUpdates", discord.notificationChannels.appUpdates)}
          </label>
        </div>
      </div>
      <div className="status-detail discord-notification-status">
        <StatusInfo
          label="Interaction endpoint"
          value={discord.interactionUrl ? `${window.location.origin}${discord.interactionUrl}` : `${window.location.origin}/api/discord/interactions`}
        />
        <StatusInfo label="Slash commands" value="/help, /supplies, /online, /crafts, /price, /craftwatch" />
        <StatusInfo
          label="Token status"
          value={discord.botTokenConfigured ? `Configured via ${discord.botTokenSource ?? "server"}` : "Not configured"}
        />
        <StatusInfo label="Last Discord delivery" value={discordDeliveryLabel} />
      </div>
    </section>
  );
}
