import React from "react";
import { Command, MessageCircle } from "lucide-react";
import { ActionButton } from "../main/ActionButton";

type DiscordTestKind = string;

export function DiscordTestsPanel({
  botOnly,
  discordTestButtons,
  onRegisterCommands,
  onSendTest,
  isPending,
}: {
  botOnly: boolean;
  discordTestButtons: readonly (readonly [DiscordTestKind, string])[];
  onRegisterCommands: () => void;
  onSendTest: (kind: DiscordTestKind, label: string) => Promise<void>;
  isPending: (key: string) => boolean;
}) {
  return (
    <details className="form-card discord-preview-card" open={botOnly}>
      <summary>
        <span>
          <MessageCircle size={17} /> Notification Tests
        </span>
        <small>Preview Discord message formats</small>
      </summary>
      <div className="toolbar discord-actions">
        <ActionButton className="toolbar-button" pending={isPending("discord-commands-register")} pendingLabel="Registering commands..." onClick={onRegisterCommands}>
          <Command size={15} /> Register Commands
        </ActionButton>
      </div>
      <p className="legend">
        Use a Discord application with the bot and applications.commands scopes. Guild command registration is immediate; global
        commands can take longer to appear.
      </p>
      <p className="legend">Send sample messages to the configured channel to preview how each alert type will look in Discord.</p>
      <div className="discord-test-grid">
        {discordTestButtons.map(([kind, label]) => (
          <ActionButton key={kind} className="toolbar-button" pending={isPending(`discord-test:${kind}`)} pendingLabel={`Sending ${label}...`} onClick={() => onSendTest(kind, label)}>
            <MessageCircle size={14} /> {label}
          </ActionButton>
        ))}
      </div>
    </details>
  );
}
