import React from "react";
import { MessageCircle, RefreshCw } from "lucide-react";

type DiscordSettings = Record<string, any>;

function StatusInfo({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function DiscordSetupSection({
  discord,
  discordDiscovery,
  discoveredChannelCount,
  discoveredRoleCount,
  formatNumber,
  onSync,
  status,
  updateDiscord,
  updateDiscordPresence,
}: {
  discord: DiscordSettings;
  discordDiscovery: Record<string, any> | null | undefined;
  discoveredChannelCount: number;
  discoveredRoleCount: number;
  formatNumber: (value: unknown) => string;
  onSync: () => void;
  status: Record<string, any> | null | undefined;
  updateDiscord: (patch: Partial<DiscordSettings>) => void;
  updateDiscordPresence: (patch: Record<string, unknown>) => void;
}) {
  return (
    <section className="form-card">
      <h3>
        <MessageCircle size={17} /> Discord Bot
      </h3>
      <label className="toggle-line">
        <input type="checkbox" checked={discord.enabled} onChange={(event) => updateDiscord({ enabled: event.target.checked })} />
        <span>Enable Discord notifications and slash commands</span>
      </label>
      <label className="field">
        <span>Bot Token</span>
        <input
          type="password"
          value={discord.botToken ?? ""}
          onChange={(event) => updateDiscord({ botToken: event.target.value, clearBotToken: false })}
          placeholder={discord.botTokenConfigured ? `Configured via ${discord.botTokenSource ?? "server"}` : "Paste token from Discord Developer Portal"}
        />
      </label>
      {discord.botTokenConfigured ? (
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={discord.clearBotToken === true}
            onChange={(event) => updateDiscord({ clearBotToken: event.target.checked, botToken: "" })}
          />
          <span>Clear stored bot token on save</span>
        </label>
      ) : null}
      <label className="field">
        <span>Application ID</span>
        <input value={discord.applicationId} onChange={(event) => updateDiscord({ applicationId: event.target.value })} />
      </label>
      <label className="field">
        <span>Public Key</span>
        <input value={discord.publicKey} onChange={(event) => updateDiscord({ publicKey: event.target.value })} />
      </label>
      <label className="field">
        <span>Server/Guild ID</span>
        <input
          value={discord.guildId}
          onChange={(event) => updateDiscord({ guildId: event.target.value })}
          placeholder="Recommended for instant slash command updates"
        />
      </label>
      <div className="discord-presence-card">
        <div className="split-header">
          <div>
            <h4>Bot Presence</h4>
            <p className="legend">Keeps the bot online in Discord and displays the status text under its username.</p>
          </div>
          <label className="toggle-line">
            <input
              type="checkbox"
              checked={discord.presence.enabled}
              onChange={(event) => updateDiscordPresence({ enabled: event.target.checked })}
            />
            <span>Show online</span>
          </label>
        </div>
        <div className="discord-presence-grid">
          <label className="field">
            <span>Status</span>
            <select value={discord.presence.status} onChange={(event) => updateDiscordPresence({ status: event.target.value })}>
              <option value="online">Online</option>
              <option value="idle">Idle</option>
              <option value="dnd">Do not disturb</option>
              <option value="invisible">Invisible</option>
            </select>
          </label>
          <label className="field">
            <span>Activity</span>
            <select value={discord.presence.activityType} onChange={(event) => updateDiscordPresence({ activityType: event.target.value })}>
              <option value="watching">Watching</option>
              <option value="playing">Playing</option>
              <option value="listening">Listening to</option>
              <option value="competing">Competing in</option>
            </select>
          </label>
          <label className="field">
            <span>Text</span>
            <input
              value={discord.presence.activityText}
              onChange={(event) => updateDiscordPresence({ activityText: event.target.value })}
              placeholder="app.timbersteeltrade.com"
            />
          </label>
        </div>
        <div className="status-detail">
          <StatusInfo label="Gateway" value={status?.discord?.gateway?.connected ? "Connected" : "Not connected"} />
          <StatusInfo
            label="Presence"
            value={status?.discord?.gateway?.activity || `${discord.presence.status} - ${discord.presence.activityType} ${discord.presence.activityText}`}
          />
          <StatusInfo label="Gateway error" value={status?.discord?.gateway?.lastError ?? "None"} />
        </div>
      </div>
      <div className="status-detail">
        <StatusInfo
          label="Discovered server"
          value={discordDiscovery?.guild?.name ? `${discordDiscovery.guild.name} (${discordDiscovery.guild.id})` : "Not synced yet"}
        />
        <StatusInfo
          label="Discovered bot"
          value={discordDiscovery?.bot?.username ? `${discordDiscovery.bot.username} (${discordDiscovery.bot.id})` : "Not synced yet"}
        />
        <StatusInfo label="Channels" value={formatNumber(discoveredChannelCount)} />
        <StatusInfo label="Roles" value={formatNumber(discoveredRoleCount)} />
      </div>
      <button className="toolbar-button" onClick={onSync}>
        <RefreshCw size={15} /> Sync Discord Server
      </button>
      <p className="legend">Use the floating save bar to apply setup changes.</p>
    </section>
  );
}
