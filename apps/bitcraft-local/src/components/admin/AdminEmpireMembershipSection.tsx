import React from "react";
import {
  AlertTriangle,
  History,
  LogIn,
  LogOut,
  RefreshCw,
  RotateCcw,
  Users,
} from "lucide-react";
import "../../styles/admin-empire-membership.css";
import { DataTable } from "../main/DataTable";
import { SearchBox } from "../main/SearchBox";
import { Segmented } from "../main/Segmented";
import { Stat } from "../main/Stats";
import { AsyncState } from "../main/AsyncState";
import { dateLabel, formatNumber } from "../../utils/format";

type CurrentMember = {
  id: number;
  playerEntityId: string;
  playerName: string;
  membershipStatus: "initial" | "joined" | "rejoined";
  observedJoinedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
};

type DepartedMember = {
  id: number;
  playerEntityId: string;
  playerName: string;
  observedLeftAt: string;
  departureConfirmedAt: string;
  previousStatus: "joined" | "rejoined";
};

export type EmpireMembershipAdminView = {
  tracking: null | {
    sessionId: number;
    empireId: string;
    empireName: string;
    trackingStartedAt: string;
    lastSuccessAt: string | null;
  };
  summary: {
    currentMembers: number;
    joinedLast30Days: number;
    departedLast30Days: number;
    rejoinsLast30Days: number;
  };
  currentMembers: CurrentMember[];
  departedMembers: DepartedMember[];
  retentionDays: number;
  generatedAt: string;
  collector: {
    enabled: boolean;
    running: boolean;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    nextRunAt: string | null;
  };
};

type AdminEmpireMembershipSectionProps = {
  data: EmpireMembershipAdminView | null;
  pending: boolean;
  error?: string | null;
  onRefresh: () => void;
};

function membershipLabel(row: CurrentMember) {
  if (row.membershipStatus === "initial") return "Present when tracking began";
  if (row.membershipStatus === "rejoined") return "Rejoined";
  return "Joined";
}

function previousMembershipLabel(row: DepartedMember) {
  return row.previousStatus === "rejoined" ? "Rejoined" : "Joined";
}

export function AdminEmpireMembershipSection({
  data,
  pending,
  error,
  onRefresh,
}: AdminEmpireMembershipSectionProps) {
  const [search, setSearch] = React.useState("");
  const [currentRange, setCurrentRange] = React.useState<"30" | "all">("30");
  const [departedRange, setDepartedRange] = React.useState<"30" | "all">("30");
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const query = search.trim().toLowerCase();

  const currentRows = (data?.currentMembers ?? []).filter((member) => {
    if (query && !member.playerName.toLowerCase().includes(query)) return false;
    if (currentRange === "all") return true;
    return member.observedJoinedAt != null && Date.parse(member.observedJoinedAt) >= cutoff;
  });
  const departedRows = (data?.departedMembers ?? []).filter((member) => {
    if (query && !member.playerName.toLowerCase().includes(query)) return false;
    return departedRange === "all" || Date.parse(member.observedLeftAt) >= cutoff;
  });

  if (!data && pending) {
    return (
      <AsyncState
        kind="loading"
        title="Loading empire membership"
        detail="Reading the compact observed membership history."
      />
    );
  }
  if (!data && error) {
    return <AsyncState kind="error" title="Empire membership unavailable" detail={error} />;
  }
  if (!data?.tracking) {
    return (
      <AsyncState
        kind="empty"
        title="Membership tracking has not started"
        detail="Tracking begins after the next successful roster collection for a settlement in an empire."
        action={
          <button className="toolbar-button" type="button" disabled={pending} onClick={onRefresh}>
            <RefreshCw size={15} className={pending ? "spin" : undefined} /> Refresh
          </button>
        }
      />
    );
  }

  const currentEmptyKind = query ? "no-match" : "empty";
  const departedEmptyKind = query ? "no-match" : "empty";
  return (
    <>
      <div className="empire-membership-toolbar">
        <div>
          <h3><History size={18} /> {data.tracking.empireName}</h3>
          <p className="legend">
            Observed membership since {dateLabel(data.tracking.trackingStartedAt)}. Closed periods are retained for{" "}
            {formatNumber(data.retentionDays)} days.
          </p>
        </div>
        <button className={`toolbar-button${pending ? " is-loading" : ""}`} type="button" disabled={pending} onClick={onRefresh}>
          <RefreshCw size={15} className={pending ? "spin" : undefined} />
          {pending ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {data.collector.lastError || error ? (
        <div className="empire-membership-warning" role="alert">
          <AlertTriangle size={17} />
          <div>
            <strong>Latest roster refresh failed</strong>
            <span>{error ?? data.collector.lastError}. Retained membership history remains visible.</span>
          </div>
        </div>
      ) : null}

      <div className="empire-membership-status">
        <Stat icon={<Users />} label="Current members" value={formatNumber(data.summary.currentMembers)} />
        <Stat icon={<LogIn />} label="Joined in 30 days" value={formatNumber(data.summary.joinedLast30Days)} />
        <Stat icon={<LogOut />} label="Departed in 30 days" value={formatNumber(data.summary.departedLast30Days)} />
        <Stat icon={<RotateCcw />} label="Rejoins in 30 days" value={formatNumber(data.summary.rejoinsLast30Days)} />
      </div>

      <div className="empire-membership-search">
        <SearchBox
          label="Search empire members"
          value={search}
          onChange={setSearch}
          placeholder="Search player names"
          resultsId="empire-membership-results"
        />
        <span className="legend">Last successful roster: {dateLabel(data.collector.lastSuccessAt)}</span>
      </div>

      <div className="empire-membership-grid" id="empire-membership-results">
        <section className="form-card">
          <div className="empire-membership-filter-row">
            <div>
              <h3><Users size={17} /> Current members</h3>
              <p className="legend">Initial members have no invented join date.</p>
            </div>
            <Segmented<"30" | "all">
              label="Current member range"
              value={currentRange}
              onChange={setCurrentRange}
              options={[
                { id: "30", label: "Joined in last 30 days", count: data.summary.joinedLast30Days + data.summary.rejoinsLast30Days },
                { id: "all", label: "All current members", count: data.currentMembers.length },
              ] as const}
            />
          </div>
          <DataTable
            scrollLabel="Current empire membership table"
            rows={currentRows}
            emptyKind={currentEmptyKind}
            emptyState={
              query
                ? "No current members match this search."
                : currentRange === "30"
                  ? "No observed joins or rejoins in the last 30 days."
                  : "No current members were recorded."
            }
            columns={[
              ["Player", (row) => <strong className="empire-membership-name">{row.playerName}</strong>],
              ["Status", (row) => <span className={`empire-membership-badge ${row.membershipStatus}`}>{membershipLabel(row as CurrentMember)}</span>],
              ["Observed", (row) => row.observedJoinedAt ? dateLabel(row.observedJoinedAt) : dateLabel(row.firstSeenAt)],
              ["Last seen", (row) => dateLabel(row.lastSeenAt)],
            ]}
          />
        </section>

        <section className="form-card">
          <div className="empire-membership-filter-row">
            <div>
              <h3><LogOut size={17} /> Departed members</h3>
              <p className="legend">A departure appears after two consecutive successful roster omissions.</p>
            </div>
            <Segmented<"30" | "all">
              label="Departure range"
              value={departedRange}
              onChange={setDepartedRange}
              options={[
                { id: "30", label: "Departed in last 30 days", count: data.summary.departedLast30Days },
                { id: "all", label: "All retained departures", count: data.departedMembers.length },
              ] as const}
            />
          </div>
          <DataTable
            scrollLabel="Departed empire membership table"
            rows={departedRows}
            emptyKind={departedEmptyKind}
            emptyState={
              query
                ? "No departed members match this search."
                : departedRange === "30"
                  ? "No confirmed departures in the last 30 days."
                  : "No retained departures were recorded."
            }
            columns={[
              ["Player", (row) => <strong className="empire-membership-name">{row.playerName}</strong>],
              ["Previous status", (row) => <span className="empire-membership-badge departed">{previousMembershipLabel(row as DepartedMember)}</span>],
              ["Observed departure", (row) => dateLabel(row.observedLeftAt)],
              ["Confirmed", (row) => dateLabel(row.departureConfirmedAt)],
            ]}
          />
        </section>
      </div>
    </>
  );
}
