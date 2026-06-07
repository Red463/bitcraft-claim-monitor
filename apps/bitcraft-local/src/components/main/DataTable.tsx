import React from "react";
import type { AnyRecord } from "../../main-app-data";

export function DataTable({
  rows,
  columns,
  onRowClick,
  rowClassName,
}: {
  rows: AnyRecord[];
  columns: Array<[string, (row: AnyRecord, index: number) => React.ReactNode]>;
  onRowClick?: (row: AnyRecord) => void;
  rowClassName?: (row: AnyRecord) => string;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map(([label]) => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr
              className={`data-row ${rowClassName?.(row) ?? ""}`}
              key={row.entityId ?? row.id ?? index}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map(([label, render]) => <td key={label}>{render(row, index) ?? "-"}</td>)}
            </tr>
          )) : <tr><td colSpan={columns.length}>No data returned.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
