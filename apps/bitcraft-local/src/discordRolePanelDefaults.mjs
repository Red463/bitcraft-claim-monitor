export function createDefaultRolePanels(craftRoles = {}) {
  return [
    {
      key: "access",
      label: "Access Roles",
      channelId: "",
      messageId: "",
      title: "Welcome to Timbersteel Trade!",
      description: "Choose your access role below.",
      mode: "single",
      showHelperText: true,
      options: [
        { key: "citizen", label: "Citizen", roleId: "", emoji: "1️⃣" },
        { key: "visitor", label: "Visitor", roleId: "", emoji: "2️⃣" },
      ],
    },
    {
      key: "professions",
      label: "Profession Roles",
      channelId: "",
      messageId: "",
      title: "Choose Your Professions",
      description: "Select as many profession interests as you like.",
      mode: "multi",
      showHelperText: true,
      options: Object.keys(craftRoles).map((key) => ({
        key,
        label: key === "leatherworking" ? "Leatherworking" : key[0].toUpperCase() + key.slice(1),
        roleId: craftRoles[key],
        emoji: "",
      })),
    },
    { key: "events", label: "Event Roles", channelId: "", messageId: "", title: "Event Roles", description: "Choose event pings you want.", mode: "multi", showHelperText: true, options: [] },
    { key: "timezones", label: "Timezone Roles", channelId: "", messageId: "", title: "Timezone Roles", description: "Choose your timezone group.", mode: "single", showHelperText: true, options: [] },
  ];
}
