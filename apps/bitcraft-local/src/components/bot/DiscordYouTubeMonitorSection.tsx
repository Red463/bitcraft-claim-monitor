import React from "react";
import { ExternalLink, Plus, RefreshCw, Trash2, Youtube } from "lucide-react";
import { dateLabel, formatNumber } from "../../utils/format";
import type { AnyRecord } from "../../main-app-data";
import { ActionButton } from "../main/ActionButton";

type Api = (path: string, options?: RequestInit) => Promise<AnyRecord>;

type Props = {
  api: Api;
  channelIdSelect: (key: string, value: string) => React.ReactNode;
  optionalChannelIdSelect: (value: string, onChange: (value: string) => void, defaultLabel?: string, disabled?: boolean) => React.ReactNode;
  discord: AnyRecord;
  isPending: (key: string) => boolean;
  run: (task: () => Promise<unknown>, success: string | undefined, busyKey: string) => Promise<void>;
  updateDiscord: (patch: Partial<AnyRecord>) => void;
  updateDiscordNotify: (key: string, value: boolean) => void;
};

export function DiscordYouTubeMonitorSection({ api, channelIdSelect, optionalChannelIdSelect, discord, isPending, run, updateDiscord, updateDiscordNotify }: Props) {
  const [status, setStatus] = React.useState<AnyRecord | null>(null);
  const [input, setInput] = React.useState("");

  const refresh = async () => {
    setStatus(await api("/admin/discord/youtube"));
  };

  React.useEffect(() => {
    let active = true;
    void api("/admin/discord/youtube").then((result) => {
      if (active) setStatus(result);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const channels: AnyRecord[] = status?.channels ?? [];
  const youtube = discord.youtube ?? { enabled: true, pollIntervalMinutes: 10 };

  return (
    <section className="form-card discord-channel-card bot-youtube-card">
      <div className="split-header">
        <div>
          <h3><Youtube size={17} /> YouTube Monitor</h3>
          <p className="legend">Watch YouTube RSS feeds and post new videos to the configured announcements channel.</p>
        </div>
        <ActionButton className="toolbar-button" pending={isPending("youtube-refresh")} pendingLabel="Refreshing..." onClick={() => run(refresh, undefined, "youtube-refresh")}><RefreshCw size={15} /> Refresh</ActionButton>
      </div>
      <div className="discord-rule-grid youtube-monitor-settings">
        <div className="discord-rule-card">
          <h4>Monitoring</h4>
          <label className="toggle-line">
            <input type="checkbox" checked={youtube.enabled !== false} onChange={(event) => updateDiscord({ youtube: { ...youtube, enabled: event.target.checked } })} />
            <span>Enable YouTube monitoring</span>
          </label>
          <label className="toggle-line">
            <input type="checkbox" checked={discord.notify.youtubeVideos !== false} onChange={(event) => updateDiscordNotify("youtubeVideos", event.target.checked)} />
            <span>Send Discord notifications</span>
          </label>
          <label className="field">
            <span>Poll interval minutes</span>
            <input type="number" min={1} max={1440} value={youtube.pollIntervalMinutes ?? 10} onChange={(event) => updateDiscord({ youtube: { ...youtube, pollIntervalMinutes: Number(event.target.value) } })} />
          </label>
        </div>
        <div className="discord-rule-card">
          <h4>Announcements</h4>
          <label className="field">
            <span>Discord channel</span>
            {channelIdSelect("youtubeVideos", discord.notificationChannels.youtubeVideos ?? discord.channels?.announcements ?? "")}
          </label>
          <p className="legend">Choose any synced Discord channel as the default. Individual YouTube channels can override it below.</p>
        </div>
      </div>
      <div className="discord-tool-form-card youtube-add-card">
        <h4><Plus size={15} /> Add Channel</h4>
        <label className="field">
          <span>YouTube channel URL, @handle, or channel ID</span>
          <input value={input} onChange={(event) => setInput(event.target.value)} placeholder="https://www.youtube.com/@channel or UC..." />
        </label>
        <p className="legend">Existing videos are marked as seen when a channel is added. Only videos published after setup are announced.</p>
        <ActionButton className="toolbar-button primary" disabled={!input.trim()} pending={isPending("youtube-add")} pendingLabel="Adding channel..." onClick={() => run(async () => {
          const result = await api("/admin/discord/youtube/channels", { method: "POST", body: JSON.stringify({ input }) });
          setStatus(result);
          setInput("");
        }, "YouTube channel added and seeded.", "youtube-add")}><Plus size={14} /> Add Channel</ActionButton>
      </div>
      <div className="discord-report-list youtube-channel-list">
        {channels.length ? channels.map((channel) => (
          <article className="discord-report-item youtube-channel-row" key={channel.channelId}>
            <div className={`discord-report-dot ${channel.enabled ? "ok" : ""}`} />
            <div>
              <strong>{channel.title || channel.channelId}</strong>
              <span>{channel.channelId}</span>
              <small>Last check {dateLabel(channel.lastCheckedAt)} | Last video {channel.lastVideoTitle || "None"}</small>
              {channel.lastError ? <small className="error">{channel.lastError}</small> : null}
              <label className="field youtube-channel-target">
                <span>Announcement channel</span>
                {optionalChannelIdSelect(channel.discordChannelId ?? "", (value) => run(async () => setStatus(await api("/admin/discord/youtube/channels", { method: "PUT", body: JSON.stringify({ channelId: channel.channelId, discordChannelId: value }) })), "YouTube announcement channel updated.", `youtube-target:${channel.channelId}`), "Use default", isPending(`youtube-target:${channel.channelId}`))}
                {isPending(`youtube-target:${channel.channelId}`) ? <small role="status">Updating channel...</small> : null}
              </label>
            </div>
            <div className="toolbar youtube-channel-actions">
              {channel.url ? <a className="toolbar-button" href={channel.url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a> : null}
              <ActionButton className="toolbar-button" pending={isPending(`youtube-check:${channel.channelId}`)} pendingLabel="Checking..." onClick={() => run(async () => setStatus(await api("/admin/discord/youtube/check", { method: "POST", body: JSON.stringify({ channelId: channel.channelId }) })), "YouTube channel checked.", `youtube-check:${channel.channelId}`)}><RefreshCw size={14} /> Check</ActionButton>
              <ActionButton className="toolbar-button" pending={isPending(`youtube-toggle:${channel.channelId}`)} pendingLabel={channel.enabled ? "Disabling..." : "Enabling..."} onClick={() => run(async () => setStatus(await api("/admin/discord/youtube/channels", { method: "PUT", body: JSON.stringify({ channelId: channel.channelId, enabled: !channel.enabled }) })), `YouTube channel ${channel.enabled ? "disabled" : "enabled"}.`, `youtube-toggle:${channel.channelId}`)}>{channel.enabled ? "Disable" : "Enable"}</ActionButton>
              <ActionButton className="toolbar-button danger" pending={isPending(`youtube-remove:${channel.channelId}`)} pendingLabel="Removing..." onClick={() => run(async () => setStatus(await api(`/admin/discord/youtube/channels?channelId=${encodeURIComponent(channel.channelId)}`, { method: "DELETE" })), "YouTube channel removed.", `youtube-remove:${channel.channelId}`)}><Trash2 size={14} /> Remove</ActionButton>
            </div>
          </article>
        )) : <p className="legend">No YouTube channels are monitored yet.</p>}
      </div>
      <div className="status-detail discord-notification-status">
        <div className="info-row"><span>Channels monitored</span><strong>{formatNumber(channels.length)}</strong></div>
        <div className="info-row"><span>Scheduled job</span><strong>{status?.scheduledJob?.enabled ? status.scheduledJob.scheduleLabel : "Disabled"}</strong></div>
        <div className="info-row"><span>Announcements channel</span><strong>{status?.announcementsChannelId || "Not configured"}</strong></div>
      </div>
    </section>
  );
}
