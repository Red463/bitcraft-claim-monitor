import React from "react";
import { MessageCircle } from "lucide-react";

export function DiscordChannelsSection({
  botOnly,
  channelFields,
  channelIdSelect,
  discordChannelLabel,
  discordChannels,
  discoveredChannelCount,
  updateDiscordChannel,
}: {
  botOnly: boolean;
  channelFields: readonly string[];
  channelIdSelect: (value: string, onChange: (value: string) => void) => React.ReactNode;
  discordChannelLabel: (key: string) => string;
  discordChannels: Record<string, string> | undefined;
  discoveredChannelCount: number;
  updateDiscordChannel: (key: string, value: string) => void;
}) {
  return (
    <details className="form-card discord-channel-card" open={botOnly}>
      <summary>
        <span>
          <MessageCircle size={17} /> Channel List
        </span>
        <small>Channel IDs and profession routing</small>
      </summary>
      <p className="legend">
        Choose channels discovered by the bot. Profession channels here are also used when craft notifications route by profession.
      </p>
      {!discoveredChannelCount ? <div className="error">No Discord channels synced yet. Use Setup &gt; Sync Discord Server.</div> : null}
      <div className="craft-channel-grid">
        {channelFields.map((key) => (
          <label className="field" key={key}>
            <span>{discordChannelLabel(key)}</span>
            {channelIdSelect(discordChannels?.[key] ?? "", (value) => updateDiscordChannel(key, value))}
          </label>
        ))}
      </div>
    </details>
  );
}
