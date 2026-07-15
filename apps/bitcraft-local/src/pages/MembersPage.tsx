import React from "react";
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
  Users,
  Wrench,
} from "lucide-react";
import { RarityBadge, TierBadge, TrackedOwnerName } from "../components/main/Badges";
import { DataTable } from "../components/main/DataTable";
import { ItemIcon } from "../components/main/ItemDisplay";
import { SearchBox } from "../components/main/SearchBox";
import { MiniStat } from "../components/main/Stats";
import { toNumber, type AnyRecord } from "../main-app-data";
import { summarizePassiveCrafts } from "../utils/crafts";
import { formatCurrentSession, formatEquipmentSlot, formatNumber, timeAgo } from "../utils/format";
import { equippedCount, equipmentPresets, equipmentSlots, playerToolbeltTools, visibleEquipmentSlots } from "../utils/items";
import { normalizeData } from "../utils/normalize";
import { memberClaimRole } from "../utils/ownership";

const API = "/api/bitjita";

/**
 * Settlement roster and member-detail view.
 *
 * Summary rows come from the normalized claim/member payload, while the detail
 * pane may fetch extra BitJita player data for equipment, tools, sessions, and
 * passive crafts. Keep those detail fetches optional because BitJita can return
 * partial player data during API blips.
 */
export function Members({
  data,
  selectedMemberId,
  onSelectMember,
  onMemberDetailsOpened,
}: {
  data: ReturnType<typeof normalizeData>;
  selectedMemberId: string;
  onSelectMember: (id: string) => void;
  onMemberDetailsOpened?: () => void;
}) {
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
    setProfileLoading(true);
    setProfileError(null);
    Promise.all([
      fetch(`${API}/players/${selectedId}/buffs`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/equipment`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/equipment/presets`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/inventories`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/housing`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/passive-crafts?status=all`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/market-collections`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`${API}/players/${selectedId}/traveler-tasks`, { signal: controller.signal }).then((response) => response.json()),
    ]).then(([buffs, equipment, equipmentPresetData, inventories, housing, passiveCrafts, collections, tasks]) => {
      setProfile({ buffs, equipment, equipmentPresets: equipmentPresetData, inventories, housing, passiveCrafts, collections, tasks });
    }).catch((error) => {
      if (!controller.signal.aborted) setProfileError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (!controller.signal.aborted) setProfileLoading(false);
    });
    return () => controller.abort();
  }, [selectedId]);
  const passiveCraftSummaries = profile ? summarizePassiveCrafts(profile.passiveCrafts) : [];
  const currentEquipmentSlots = profile ? equipmentSlots(profile.equipment) : [];
  const gearPresets = profile ? equipmentPresets(profile.equipmentPresets, currentEquipmentSlots) : [];
  const activeGearSlots = gearPresets.find((preset) => preset.active)?.slots ?? currentEquipmentSlots;

  return (
    <div className="panel members-page" data-tour="members-page">
      <header className="members-topbar">
        <div>
          <h2>Settlement Roster</h2>
          <p>Member permissions and online status</p>
        </div>
        <div className="dashboard-top-meta">
          <div className="dashboard-meta-cluster">
            <span className="dashboard-region-line"><Globe2 size={15} /> {data.claim.regionName ?? "Unknown"} <span className="dashboard-region-badge">R{data.claim.regionId ?? "?"}</span></span>
            <span className="dashboard-refresh-line"><span className="online-dot is-online" /> {onlineCount} online / {merged.length} members</span>
          </div>
          <span className="dashboard-claim-link"><TierBadge tier={data.claim.tier} /> {data.claim.name ?? "Monitored Settlement"}</span>
        </div>
      </header>
      <div className="members-summary-grid">
        <article><Users /><span>Members</span><strong>{merged.length}</strong><small>{onlineCount} online now</small></article>
        <article><Activity /><span>Total Levels</span><strong>{formatNumber(totalMemberLevels)}</strong><small>Across visible citizens</small></article>
        <article><Hammer /><span>Build Access</span><strong>{merged.filter((member) => member.buildPermission).length}</strong><small>Members with build rights</small></article>
        <article><Shield /><span>Storage Access</span><strong>{merged.filter((member) => member.inventoryPermission).length}</strong><small>Members with inventory rights</small></article>
      </div>
      <div className="toolbar-row members-toolbar">
        <SearchBox label="Search settlement members" value={searchTerm} onChange={setSearchTerm} placeholder="Search username" />
        <span>{filtered.length} members found</span>
      </div>
      <div className="members-roster-table">
        <DataTable
          rows={filtered}
          emptyState={searchTerm ? "No members match this search." : "No settlement members were returned."}
          onRowClick={openMemberDetails}
          rowClassName={(member) => String(member.playerEntityId) === selectedId ? "selected-row" : "clickable-row"}
          columns={[
            ["Username", (m) => (
              <span className="member-name-cell">
                <span className="member-row-avatar">{String(m.username ?? "?").slice(0, 1).toUpperCase()}<i className={`online-dot ${m.player?.signedIn ? "is-online" : ""}`} /></span>
                <span className="member-row-copy"><strong><TrackedOwnerName name={m.username} claim={data.claim} members={data.members} /></strong><small>{m.player?.signedIn ? "Online now" : `Last seen ${timeAgo(m.lastLoginTimestamp)}`}</small></span>
              </span>
            )],
            ["Role", (m) => {
              const role = memberClaimRole(m, data.claim);
              return <span className={`role-badge ${role === "Owner" || role === "Co-owner" ? "owner" : role === "Officer" ? "officer" : ""}`}>{role}</span>;
            }],
            ["Total Levels", (m) => formatNumber(m.citizen?.totalLevel ?? m.citizen?.totalSkillLevel)],
            ["Session", (m) => {
              const sessionLabel = formatCurrentSession(m.player?.sessionSeconds);
              return m.player?.signedIn ? <span className="online-text">{sessionLabel ? `Playing ${sessionLabel}` : "Online"}</span> : <span className="muted-cell">Offline</span>;
            }],
            ["Permissions", (m) => {
              const canManage = Boolean(m.coOwnerPermission || m.officerPermission || m.buildPermission || m.inventoryPermission);
              return <span className="permission-icons"><Hammer aria-hidden="true" className={m.buildPermission ? "enabled" : ""} /><Package aria-hidden="true" className={m.inventoryPermission ? "enabled blue" : ""} /><span className={`status-pill ${canManage ? "good" : "muted"}`}>{canManage ? "Can manage settlement" : "Standard member"}</span></span>;
            }],
            ["Details", (m) => <button className="mini-action" type="button" aria-label={`View ${String(m.username ?? "member")} details`} onClick={(event) => { event.stopPropagation(); openMemberDetails(m); }}>View details</button>],
          ]}
        />
      </div>
      {selectedMember ? (
        <section className="member-detail">
          <div className="split-header">
            <h3><User size={17} /> {selectedMember.username} Public Profile</h3>
            <div className="profile-actions">
              <button className={`mini-action ${selectedMemberId === selectedId ? "active" : ""}`} onClick={() => onSelectMember(selectedMemberId === selectedId ? "All" : String(selectedMember.playerEntityId))}><Factory size={13} /> {selectedMemberId === selectedId ? "Clear Production Filter" : "Use for Production"}</button>
              <button className="mini-action" onClick={() => setSelectedId(null)}>Close</button>
            </div>
          </div>
          {profileLoading ? <p className="legend">Loading public player data...</p> : profileError ? <p className="error">{profileError}</p> : profile ? (
            <>
              <div className="metric-grid">
                <MiniStat icon={<Activity />} label="Active Buffs" value={(profile.buffs.buffs ?? []).length} />
                <MiniStat icon={<Wrench />} label="Toolbelt Tools" value={playerToolbeltTools(profile.inventories).length} />
                <MiniStat icon={<Shield />} label="Active Gear" value={equippedCount(activeGearSlots)} />
                <MiniStat icon={<Home />} label="Housing" value={(profile.housing ?? []).length} />
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
                      <span className="item-meta-line">{item.tag ?? "Tool"}{item.rarityStr ? <RarityBadge rarity={item.rarityStr} /> : null}{item.quantity > 1 ? `${formatNumber(item.quantity)} held` : ""}</span>
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
                                  <span className="item-meta-line">{slot.item.tags ?? "Equipment"}{slot.item.rarityString ? <RarityBadge rarity={slot.item.rarityString} /> : null}</span>
                                  {(slot.item.stats ?? []).length ? <p>{slot.item.stats.slice(0, 3).map((stat: AnyRecord) => `${stat.name} ${formatNumber(stat.value, 2)}${stat.suffix ?? ""}`).join(" | ")}</p> : null}
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
                        {!preset.reported ? <p className="legend">BitJita has not reported gear for this preset slot, so empty visible slots are shown as placeholders.</p> : null}
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
                    <span>{formatNumber((profile.passiveCrafts.craftResults ?? []).length)} records</span>
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
                  <DataTable rows={(profile.tasks.tasks ?? []).slice(0, 8)} emptyState="No recent quests were returned for this member." columns={[
                    ["Quest", (row) => row.description ?? "-"],
                    ["Status", (row) => row.completed ? "Complete" : "Open"],
                  ]} />
                </section>
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

