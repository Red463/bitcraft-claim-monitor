function characterFields({ administrator, characterName, characterPlayerId }, { includeAdministrator = true } = {}) {
  return [
    ...(includeAdministrator ? [{ name: "Administrator", value: String(administrator || "Administrator"), inline: true }] : []),
    { name: "Character", value: String(characterName || "Unknown character"), inline: true },
    { name: "Player ID", value: String(characterPlayerId || "Not provided"), inline: false },
  ];
}

function dmPayload(title, description, fields, color) {
  return {
    embeds: [{ title, description, fields, color }],
    allowed_mentions: { parse: [] },
  };
}

export function characterLinkAssignedDm(details) {
  return dmPayload(
    "BitCraft character assigned",
    `${details.projectName} has assigned and approved the character below for your Discord login. If this was unexpected, you can unlink it or delete your app account from Settings → Privacy & Data.`,
    characterFields(details),
    0x4ee28a,
  );
}

export function characterLinkUnassignedDm(details) {
  return dmPayload(
    "BitCraft character link removed",
    `${details.projectName} has removed the character link below from your Discord login. You can manage remaining account data from Settings → Privacy & Data.`,
    characterFields(details),
    0xf0c64f,
  );
}

export function characterLinkAssignmentCorrectiveDm(details) {
  return dmPayload(
    "Character assignment did not complete",
    `${details.projectName} could not complete the character assignment described in the earlier notice. This character is not linked to your account.`,
    characterFields(details, { includeAdministrator: false }),
    0xe45c5c,
  );
}
