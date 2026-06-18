import React from "react";

export const BotSectionNav = React.lazy(() => import("./BotSectionNav").then((module) => ({ default: module.BotSectionNav })));
export const DiscordChannelsSection = React.lazy(() => import("./DiscordChannelsSection").then((module) => ({ default: module.DiscordChannelsSection })));
export const DiscordColourRolesSection = React.lazy(() => import("./DiscordColourRolesSection").then((module) => ({ default: module.DiscordColourRolesSection })));
export const DiscordCraftWatchRolesSection = React.lazy(() => import("./DiscordCraftWatchRolesSection").then((module) => ({ default: module.DiscordCraftWatchRolesSection })));
export const DiscordMemberRecordsSection = React.lazy(() => import("./DiscordMemberRecordsSection").then((module) => ({ default: module.DiscordMemberRecordsSection })));
export const DiscordModerationSection = React.lazy(() => import("./DiscordModerationSection").then((module) => ({ default: module.DiscordModerationSection })));
export const DiscordNotificationsSection = React.lazy(() => import("./DiscordNotificationsSection").then((module) => ({ default: module.DiscordNotificationsSection })));
export const DiscordRoleManagerSection = React.lazy(() => import("./DiscordRoleManagerSection").then((module) => ({ default: module.DiscordRoleManagerSection })));
export const DiscordRolePanelsSection = React.lazy(() => import("./DiscordRolePanelsSection").then((module) => ({ default: module.DiscordRolePanelsSection })));
export const DiscordSafetySection = React.lazy(() => import("./DiscordSafetySection").then((module) => ({ default: module.DiscordSafetySection })));
export const DiscordSetupSection = React.lazy(() => import("./DiscordSetupSection").then((module) => ({ default: module.DiscordSetupSection })));
export const DiscordDiagnosticsPanel = React.lazy(() => import("./DiscordDiagnosticsPanel").then((module) => ({ default: module.DiscordDiagnosticsPanel })));
export const DiscordTestsPanel = React.lazy(() => import("./DiscordTestsPanel").then((module) => ({ default: module.DiscordTestsPanel })));
