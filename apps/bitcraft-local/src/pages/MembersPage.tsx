import React from "react";
import "../styles/members.css";
import {
  Activity,
  Factory,
  Globe2,
  Hammer,
  Home,
  Package,
  Shield,
  Star,
  User,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { RarityBadge, TierBadge, TrackedOwnerName } from "../components/main/Badges";
import { DataTable } from "../components/main/DataTable";
import { Dialog } from "../components/main/Dialog";
import { ItemIcon } from "../components/main/ItemDisplay";
import { PageHeader } from "../components/main/PageHeader";
import { SearchBox } from "../components/main/SearchBox";
import { MiniStat } from "../components/main/Stats";
import { toNumber, type AnyRecord } from "../main-app-data";
import { formatCurrentSession, formatEquipmentSlot, formatNumber, timeAgo } from "../utils/format";
import { equippedCount, equipmentPresets, equipmentSlots, playerToolbeltTools, visibleEquipmentSlots } from "../utils/items";
import { normalizeData } from "../utils/normalize";
import { memberClaimRole } from "../utils/ownership";
import { useManualRefresh } from "../refresh/ManualRefreshContext";
import { manualRefreshHeaders } from "../refresh/manualRefresh.mjs";
import { recruitmentSummary } from "./recruitmentView.ts";
import { memberPresenceStatus, memberSessionStatus } from "./memberPresence.ts";

/**
 * Settlement roster and member-detail view.
 *
 * Summary, equipment, buffs, and passive crafts come from normalized Relay
 * domains. Toolbelt and housing are fetched for only the opened member through
 * one bounded provider-neutral request.
 */
export function Members({
  data,
  selectedMemberId,
  onSelectMember,
  onMemberDetailsOpened,
}: {
  data: ReturnType<typeof normalizeData> & { raw?: AnyRecord | null };
  selectedMemberId: string;
  onSelectMember: (id: string) => void;
  onMemberDetailsOpened?: () => void;
}) {
  const { request, trackPromise } = useManualRefresh();
  const [searchTerm, setSearchTerm] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [profile, setProfile] = React.useState<AnyRecord | null>(null);
  const [profileLoading, setProfileLoading] = React.useState(false);
  const [profileError, setProfileError] = React.useState<string | null>(null);
  const citizenMap = new Map(data.citizens.map((c) => [String(c.userName ?? c.username ?? ""), c]));
  const playerMap = new Map(data.players.map((p) => [String(p.username ?? ""), p]));
  const merged: AnyRecord[] = data.members.map((member: AnyRecord) => {
    const username = member.userName ?? member.username ?? "";
    return {
      ...member,
      username,
      citizen: citizenMap.get(String(username)) ?? null,
      player: playerMap.get(String(username)) ?? null,
    };
  });
  const filtered = merged.filter((member) => String(member.username).toLowerCase().includes(searchTerm.toLowerCase()));
  const onlineCount = merged.filter((member) => member.player?.signedIn).length;
  const totalMemberLevels = merged.reduce((total, member) => total + toNumber(member.citizen?.totalLevel ?? member.citizen?.totalSkillLevel), 0);
  const recruitment = recruitmentSummary(data.raw?.recruitment);
  const selectedMember = merged.find((member) => String(member.playerEntityId) === selectedId);
  const openMemberDetails = (member: AnyRecord) => {
    setSelectedId(String(member.playerEntityId));
    onMemberDetailsOpened?.();
  };
  React.useEffect(() => {
    if (!selectedId) {
      setProfile(null);
      return;
    }
    const controller = new AbortController();
    const equipmentMembers = Array.isArray(data.raw?.equipment?.members)
      ? data.raw.equipment.members as AnyRecord[]
      : [];
    const relayEquipment = equipmentMembers.find((member) => (
      String(member.playerEntityId ?? "") === selectedId
    ));
    const selectedName = String(
      data.members.find((member: AnyRecord) => String(member.playerEntityId) === selectedId)?.userName ?? "",
    );
    const relayPassiveCrafts = (Array.isArray(data.raw?.crafts?.passiveCraftResults)
      ? data.raw.crafts.passiveCraftResults as AnyRecord[]
      : []).filter((craft) => String(craft.memberName ?? "") === selectedName);
    const relayProfile = {
      buffs: relayEquipment?.buffs ?? { buffs: [] },
      equipment: relayEquipment?.equipment ?? { equipmentSlots: [] },
      equipmentPresets: relayEquipment?.equipmentPresets ?? { presets: [] },
      inventories: null,
      housing: null,
      passiveCrafts: { craftResults: relayPassiveCrafts },
      tasks: selectedMember?.player?.tasks ?? { tasks: [] },
    };
    setProfile(relayProfile);
    setProfileLoading(true);
    setProfileError(null);
    const requestOptions = { headers: manualRefreshHeaders(request, "members"), signal: controller.signal };
    const requestJson = async (url: string) => {
      const response = await fetch(url, requestOptions);
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
      return response.json();
    };
    const claimId = String(data.claim.entityId ?? data.raw?.claimId ?? "");
    const playerQuery = new URLSearchParams({ claimId, playerId: selectedId, domains: "inventory,housing" });
    const refresh = requestJson(`/api/local/player-data?${playerQuery.toString()}`);
    void trackPromise("member-details", refresh).then((payload) => {
      if (controller.signal.aborted) return;
      setProfile({
        ...relayProfile,
        inventories: payload?.domains?.inventory?.data ?? null,
        housing: payload?.domains?.housing?.data ?? null,
      });
      const partialErrors = Array.isArray(payload?.partialErrors) ? payload.partialErrors : [];
      setProfileError(partialErrors.length ? partialErrors.join(" ") : null);
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setProfileError(error instanceof Error ? error.message : String(error));
      }
    }).finally(() => {
      if (!controller.signal.aborted) setProfileLoading(false);
    });
    return () => controller.abort();
  }, [
    selectedId,
    data.claim.entityId,
    data.members,
    data.raw?.claimId,
    data.raw?.crafts,
    data.raw?.equipment,
    selectedMember?.player?.tasks,
    request?.sequence,
    trackPromise,
  ]);
  const passiveCraftSummaries: AnyRecord[] = Array.isArray(profile?.passiveCrafts?.craftResults)
    ? profile.passiveCrafts.craftResults
    : [];
  const currentEquipmentSlots = profile ? equipmentSlots(profile.equipment) : [];
  const gearPresets = profile ? equipmentPresets(profile.equipmentPresets, currentEquipmentSlots) : [];
  const activeGearSlots = gearPresets.find((preset) => preset.active)?.slots ?? currentEquipmentSlots;

  return (
    <div className="panel members-page" data-tour="members-page">
      <PageHeader
        title="Members"
        description="Settlement roster, permissions, and online status"
        meta={<div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span className="dashboard-region-line"><Globe2 size={15} /> {data.claim.regionName ?? "Unknown"} <span className="dashboard-region-badge">R{data.claim.regionId ?? "?"}</span></span>
            <span className="dashboard-refresh-line"><span className="online-dot is-online" /> {onlineCount} online / {merged.length} members</span>
          </div>
          <span className="dashboard-claim-link"><TierBadge tier={data.claim.tier} /> {data.claim.name ?? "Monitored Settlement"}</span>
        </div>}
      />
      <div className="members-summary-grid">
        <article><Users /><span>Members</span><strong>{merged.length}</strong><small>{onlineCount} online now</small></article>
        <article><Activity /><span>Total Levels</span><strong>{formatNumber(totalMemberLevels)}</strong><small>Across visible citizens</small></article>
        <article><Hammer /><span>Build Access</span><strong>{merged.filter((member) => member.buildPermission).length}</strong><small>Members with build rights</small></article>
        <article><Shield /><span>Storage Access</span><strong>{merged.filter((member) => member.inventoryPermission).length}</strong><small>Members with inventory rights</small></article>
        <article className="members-recruitment-summary"><UserPlus /><span>Recruitment</span><strong>{recruitment.statusLabel}</strong><small>{recruitment.requirementLabel} · {recruitment.approvalLabel}</small></article>
      </div>
      <div className="toolbar-row members-toolbar">
        <SearchBox label="Search settlement members" value={searchTerm} onChange={setSearchTerm} placeholder="Search username" />
        <span>{filtered.length} members found</span>
      </div>
      <div className="members-roster-table">
        <DataTable
          scrollLabel="Settlement roster table"
          rows={filtered}
          emptyState={searchTerm ? "No members match this search." : "No settlement members were returned."}
          onRowClick={openMemberDetails}
          rowClassName={(member) => String(member.playerEntityId) === selectedId ? "selected-row" : "clickable-row"}
          columns={[
            ["Username", (m) => (
              <span className="member-name-cell">
                <span className="member-row-avatar">{String(m.username ?? "?").slice(0, 1).toUpperCase()}<i className={`online-dot ${m.player?.signedIn ? "is-online" : ""}`} /></span>
                <span className="member-row-copy"><strong><TrackedOwnerName name={m.username} claim={data.claim} members={data.members} /></strong><small>{(() => {
                  const status = memberPresenceStatus({
                    ...m,
                    ...m.player,
                    lastActiveTimestamps: [
                      m.player?.lastActiveTimestamp,
                      m.lastActiveTimestamp,
                    ],
                    lastLoginTimestamp: m.player?.lastLoginTimestamp ?? m.lastLoginTimestamp,
                  });
                  return status.timestamp ? `${status.label} ${timeAgo(status.timestamp)}` : status.label;
                })()}</small></span>
              </span>
            )],
            ["Role", (m) => {
              const role = memberClaimRole(m, data.claim);
              return <span className={`role-badge ${role === "Owner" || role === "Co-owner" ? "owner" : role === "Officer" ? "officer" : ""}`}>{role}</span>;
            }],
            ["Total Levels", (m) => formatNumber(m.citizen?.totalLevel ?? m.citizen?.totalSkillLevel)],
            ["Session", (m) => {
              const sessionLabel = formatCurrentSession(m.player?.sessionSeconds);
              return m.player?.signedIn
                ? <span className="online-text">{sessionLabel ? `Playing ${sessionLabel}` : "Online"}</span>
                : <span className="muted-cell">{memberSessionStatus(m.player ?? { presenceSource: "unavailable" })}</span>;
            }],
            ["Permissions", (m) => (
              <span
                className="permission-icons"
                role="img"
                aria-label={`Build permission ${m.buildPermission ? "granted" : "not granted"}; Inventory permission ${m.inventoryPermission ? "granted" : "not granted"}`}
              >
                <Hammer aria-hidden="true" className={m.buildPermission ? "enabled" : ""} />
                <Package aria-hidden="true" className={m.inventoryPermission ? "enabled blue" : ""} />
              </span>
            )],
            ["Details", (m) => <button className="mini-action" type="button" aria-label={`View ${String(m.username ?? "member")} details`} onClick={(event) => { event.stopPropagation(); openMemberDetails(m); }}>View details</button>],
          ]}
        />
      </div>
      {selectedMember ? (
        <Dialog open title={`${String(selectedMember.username ?? "Member")} public profile`} onClose={() => setSelectedId(null)} className="member-detail member-detail-dialog" backdropClassName="member-detail-dialog-backdrop">
          <div className="split-header">
            <h3><User size={17} /> {selectedMember.username} Public Profile</h3>
            <div className="profile-actions">
              <button className={`mini-action ${selectedMemberId === selectedId ? "active" : ""}`} onClick={() => onSelectMember(selectedMemberId === selectedId ? "All" : String(selectedMember.playerEntityId))}><Factory size={13} /> {selectedMemberId === selectedId ? "Clear Production Filter" : "Use for Production"}</button>
              <button className="mini-action" onClick={() => setSelectedId(null)}>Close</button>
            </div>
          </div>
          {profileLoading ? <p className="legend">Loading optional live player details...</p> : null}
          {profileError ? <p className="error">Some optional player details are unavailable. {profileError}</p> : null}
          {profile ? (
            <>
              <div className="metric-grid">
                <MiniStat icon={<Activity />} label="Active Buffs" value={(profile.buffs?.buffs ?? []).length} />
                <MiniStat icon={<Wrench />} label="Toolbelt Tools" value={playerToolbeltTools(profile.inventories).length} />
                <MiniStat icon={<Shield />} label="Active Gear" value={equippedCount(activeGearSlots)} />
                <MiniStat icon={<Home />} label="Housing" value={profile.housing?.house ? 1 : 0} />
              </div>
              <section className="equipment-panel">
                <h3><Wrench size={17} /> Toolbelt Tools</h3>
                <div className="equipment-grid">
                  {playerToolbeltTools(profile.inventories).map((item: AnyRecord) => (
                    <article className="equipment-card" key={item.id}>
                      <small>{item.inventoryName}</small>
                      <div className="equipment-card-main">
                        <ItemIcon item={item} />
                        <strong>{item.name}</strong>
                        {item.tier ? <TierBadge tier={item.tier} /> : null}
                      </div>
                      <span className="item-meta-line">{item.tag ?? "Tool"}{item.rarityStr ?? item.rarity ? <RarityBadge rarity={item.rarityStr ?? item.rarity} /> : null}{toNumber(item.quantity) > 1 ? `${formatNumber(item.quantity)} held` : ""}</span>
                      {item.toolPower ? <p>Power {formatNumber(item.toolPower)} - removes {formatNumber(item.toolPower)} effort per action</p> : null}
                    </article>
                  ))}
                </div>
                {playerToolbeltTools(profile.inventories).length === 0 ? <p className="legend">No profession tools in this member's public Toolbelt inventory.</p> : null}
              </section>
              <section className="equipment-panel">
                <div className="profile-section-heading">
                  <h3><Shield size={17} /> Gear Presets</h3>
                  <span>2 preset slots</span>
                </div>
                <div className="gear-preset-list">
                  {gearPresets.map((preset) => {
                    const filledSlots = preset.slots.filter((slot: AnyRecord) => slot.item);
                    const displaySlots = visibleEquipmentSlots(preset.slots);
                    return (
                      <article className={`gear-preset ${preset.active ? "active" : ""}`} key={preset.id}>
                        <div className="gear-preset-header">
                          <strong>{preset.label}</strong>
                          <span>{preset.active ? "Current" : preset.reported ? `${formatNumber(filledSlots.length)} equipped` : "Not reported"}</span>
                        </div>
                        <div className="equipment-grid">
                          {displaySlots.map((slot: AnyRecord, index: number) => (
                            <article className={`equipment-card ${slot.item ? "" : "empty-slot"}`} key={`${preset.id}-${slot.primary ?? slot.secondary ?? slot.item?.id ?? index}`}>
                              <small>{formatEquipmentSlot(slot.primary)}</small>
                              {slot.item ? (
                                <>
                                  <div className="equipment-card-main">
                                    <ItemIcon item={slot.item} />
                                    <strong>{slot.item.name}</strong>
                                    {slot.item.tier ? <TierBadge tier={slot.item.tier} /> : null}
                                  </div>
                                  <span className="item-meta-line">{slot.item.tag ?? slot.item.tags ?? "Equipment"}{slot.item.rarityString ?? slot.item.rarity ? <RarityBadge rarity={slot.item.rarityString ?? slot.item.rarity} /> : null}</span>
                                  {(slot.item.stats ?? []).length ? <p>{slot.item.stats.slice(0, 3).map((stat: AnyRecord) => `${stat.name ?? stat.stat} ${formatNumber(stat.value, 2)}${stat.suffix ?? (stat.isPercent ? "%" : "")}`).join(" | ")}</p> : null}
                                </>
                              ) : (
                                <div className="equipment-card-main">
                                  <span className="empty-slot-icon"><Shield size={15} /></span>
                                  <strong>Empty</strong>
                                </div>
                              )}
                            </article>
                          ))}
                        </div>
                        {!preset.reported ? <p className="legend">Relay has not reported gear for this preset slot, so empty visible slots are shown as placeholders.</p> : null}
                      </article>
                    );
                  })}
                </div>
                {!gearPresets.length ? <p className="legend">No equipped gear reported by the API.</p> : null}
              </section>
              <div className="two-col public-profile-grid">
                <section className="profile-history-panel">
                  <div className="profile-section-heading">
                    <h3><Factory size={17} /> Passive Crafts</h3>
                    <span>{formatNumber((profile.passiveCrafts?.craftResults ?? []).length)} records</span>
                  </div>
                  <div className="passive-craft-list">
                    {passiveCraftSummaries.map((craft) => (
                      <article className="passive-craft-card" key={`${craft.recipe}-${craft.structure}-${craft.status}`}>
                        <div>
                          <strong>{craft.recipe}</strong>
                          {craft.tier ? <TierBadge tier={craft.tier} /> : null}
                        </div>
                        <p>
                          <span className={`status-pill ${craft.status === "complete" ? "complete" : ""}`}>{formatEquipmentSlot(craft.status)}</span>
                          <b>{formatNumber(craft.quantity)} crafted</b>
                        </p>
                        <small>{craft.structure} - {timeAgo(craft.timestamp)}</small>
                      </article>
                    ))}
                    {!passiveCraftSummaries.length ? <p className="legend">No passive crafts reported for this member.</p> : null}
                  </div>
                </section>
                <section className="profile-history-panel">
                  <h3><Star size={17} /> Quests</h3>
                  <DataTable rows={(profile.tasks?.tasks ?? []).slice(0, 8)} scrollLabel="Member quests table" emptyState="No recent quests were returned for this member." columns={[
                    ["Quest", (row) => row.description ?? "-"],
                    ["Status", (row) => row.completed ? "Complete" : "Open"],
                  ]} />
                </section>
              </div>
            </>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
