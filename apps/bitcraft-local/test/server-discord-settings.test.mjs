import assert from "node:assert/strict";
import test from "node:test";

import { defaultDiscordSettings, normalizeDiscordSettings } from "../src/server/discordSettings.mjs";

test("discord settings normalization preserves release-safe defaults", () => {
  const settings = normalizeDiscordSettings({
    enabled: "yes",
    applicationId: "  app-id  ",
    publicKey: "  public-key  ",
    guildId: "  guild-id  ",
    channelId: "  alerts  ",
    minSaleValue: "-10",
    supplyRunwayDaysThreshold: "0",
    productionMinXp: "-1",
    productionMinAgeMins: "12",
    productionUsers: "  user-a, user-b  ",
    supplyReportIntervalDays: "0",
    notify: {
      marketListings: false,
      production: false,
      lowSupplies: true,
    },
    channels: {
      notifications: "old-alerts",
      announcements: "  announcements  ",
      forestry: "custom-forestry",
    },
  });

  assert.equal(settings.enabled, false);
  assert.equal(settings.applicationId, "app-id");
  assert.equal(settings.publicKey, "public-key");
  assert.equal(settings.guildId, "guild-id");
  assert.equal(settings.channelId, "alerts");
  assert.equal(settings.minSaleValue, 0);
  assert.equal(settings.supplyRunwayDaysThreshold, 7);
  assert.equal(settings.productionMinXp, 0);
  assert.equal(settings.productionMinAgeMinutes, 12);
  assert.equal(settings.productionUsers, "user-a, user-b");
  assert.equal(settings.supplyReportIntervalDays, 3);
  assert.equal(settings.channels.notifications, "alerts");
  assert.equal(settings.channels.announcements, "announcements");
  assert.equal(settings.notificationChannels.youtubeVideos, "announcements");
  assert.equal(settings.marketSalesDelivery, "channel");
  assert.equal(settings.notify.youtubeVideos, true);
  assert.deepEqual(settings.youtube, { enabled: true, pollIntervalMinutes: 10 });
  assert.equal(settings.craftChannels.forestry, "custom-forestry");
  assert.equal(settings.notify.marketListings, false);
  assert.equal(settings.notify.marketSales, true);
  assert.equal(settings.notify.productionStarted, true);
  assert.equal(settings.notify.productionCompleted, true);
  assert.equal(settings.notify.lowSupplies, true);
  assert.equal(defaultDiscordSettings.notify.appUpdates, true);
});

test("discord role panels and colour roles normalize custom dashboard input", () => {
  const settings = normalizeDiscordSettings({
    colourRoles: [
      { label: "  Emerald  ", roleName: "  ", roleId: "  role-1  ", color: "-5" },
    ],
    rolePanels: [
      {
        label: "  Access  ",
        mode: "single",
        showHelperText: false,
        options: [
          { label: "  Citizen  ", roleId: " role-citizen ", emoji: "12345678901234567890" },
        ],
      },
    ],
    welcomeFlow: { enabled: true, title: "  ", message: "  Ready?  ", showNextStep: false },
    presence: { enabled: false, status: "invalid", activityType: "invalid", activityText: "" },
  });

  assert.deepEqual(settings.colourRoles, [{
    key: "green1",
    label: "Emerald",
    roleName: "Green 1",
    roleId: "role-1",
    color: 0,
  }]);
  assert.equal(settings.rolePanels.length, 1);
  assert.equal(settings.rolePanels[0].key, "access");
  assert.equal(settings.rolePanels[0].label, "Access");
  assert.equal(settings.rolePanels[0].mode, "single");
  assert.equal(settings.rolePanels[0].showHelperText, false);
  assert.deepEqual(settings.rolePanels[0].options, [{
    key: "citizen",
    label: "Citizen",
    roleId: "role-citizen",
    emoji: "1234567890123456",
  }]);
  assert.equal(settings.welcomeFlow.enabled, true);
  assert.equal(settings.welcomeFlow.title, "Welcome to Timbersteel Trade");
  assert.equal(settings.welcomeFlow.message, "Ready?");
  assert.equal(settings.welcomeFlow.showNextStep, false);
  assert.equal(settings.presence.enabled, false);
  assert.equal(settings.presence.status, "online");
  assert.equal(settings.presence.activityType, "watching");
  assert.equal(settings.presence.activityText, "app.timbersteeltrade.com");
});

test("discord settings keep market sale delivery mode explicit and disable listing Discord alerts", () => {
  assert.equal(normalizeDiscordSettings({ marketSalesDelivery: "dm", notify: { marketListings: true } }).marketSalesDelivery, "dm");
  assert.equal(normalizeDiscordSettings({ marketSalesDelivery: "invalid" }).marketSalesDelivery, "channel");
  assert.equal(normalizeDiscordSettings({ notify: { marketListings: true } }).notify.marketListings, false);
});

test("discord settings normalize craft profession emoji overrides", () => {
  const settings = normalizeDiscordSettings({
    craftChannels: { carpentry: "custom-channel" },
    craftRoles: { carpentry: "custom-role" },
    craftEmojis: {
      carpentry: " <:carpentry:123456789012345678> ",
      smithing: "<a:smithing:223456789012345678>",
      mining: ":mining:",
      farming: "<:bad name:323456789012345678>",
      foraging: "",
    },
  });

  assert.equal(settings.craftChannels.carpentry, "custom-channel");
  assert.equal(settings.craftRoles.carpentry, "custom-role");
  assert.deepEqual(settings.craftEmojis, {
    carpentry: "<:carpentry:123456789012345678>",
    smithing: "<a:smithing:223456789012345678>",
  });
});

test("discord settings normalize craft planner report configuration", () => {
  const settings = normalizeDiscordSettings({
    craftPlanReports: {
      scheduledEnabled: true,
      commandRoleId: " role-1 ",
      timezone: "Europe/London",
      rules: [
        { id: "daily-overview", enabled: true, reportType: "overview", channelId: " channel-1 ", frequency: "daily", time: "07:30" },
        { id: "bad", reportType: "profession", profession: "Unknown", frequency: "monthly", time: "99:00" },
      ],
    },
  });

  assert.equal(settings.craftPlanReports.scheduledEnabled, true);
  assert.equal(settings.craftPlanReports.commandRoleId, "role-1");
  assert.equal(settings.craftPlanReports.timezone, "Europe/London");
  assert.deepEqual(settings.craftPlanReports.rules, [{
    id: "daily-overview",
    enabled: true,
    reportType: "overview",
    profession: "",
    channelId: "channel-1",
    frequency: "daily",
    time: "07:30",
    dayOfWeek: 1,
  }, {
    id: "bad",
    enabled: false,
    reportType: "profession",
    profession: "",
    channelId: "",
    frequency: "daily",
    time: "09:00",
    dayOfWeek: 1,
  }]);
});
