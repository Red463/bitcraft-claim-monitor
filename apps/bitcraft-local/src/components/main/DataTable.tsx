import React from "react";
import type { AnyRecord } from "../../main-app-data";
import { compareSortValues, type SortDirection } from "../../utils/tableSort";

/*
 * Small generic sortable table used by several operational pages.
 *
 * Columns render React nodes for display, then cellSortText derives a stable
 * string for sorting. That keeps callers simple while preserving deterministic
 * ordering for badges, links, and nested label components.
 */

function cellSortText(value: React.ReactNode): string {
  if (value == null || typeof value === "boolean") return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(cellSortText).join(" ");
  if (React.isValidElement<{ children?: React.ReactNode }>(value)) return cellSortText(value.props.children);
  return "";
}

export function DataTable({
  rows,
  columns,
  emptyState,
  onRowClick,
  rowClassName,
}: {
  rows: AnyRecord[];
  columns: Array<[string, (row: AnyRecord, index: number) => React.ReactNode]>;
  emptyState: React.ReactNode;
  onRowClick?: (row: AnyRecord) => void;
  rowClassName?: (row: AnyRecord) => string;
}) {
  const [sort, setSort] = React.useState<{ column: number; direction: SortDirection } | null>(null);
  const indexedRows = React.useMemo(() => rows.map((row, index) => ({ row, index })), [rows]);
  const visibleRows = React.useMemo(() => {
    if (!sort) return indexedRows;
    const [, render] = columns[sort.column] ?? [];
    if (!render) return indexedRows;
    return [...indexedRows].sort((left, right) => {
      const result = compareSortValues(cellSortText(render(left.row, left.index)), cellSortText(render(right.row, right.index)), sort.direction);
      return result || left.index - right.index;
    });
  }, [columns, indexedRows, sort]);
  const toggleSort = (column: number) => {
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  };
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map(([label], columnIndex) => (
          <th key={label} aria-sort={sort?.column === columnIndex ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
            <button
              type="button"
              className={`table-sort-button ${sort?.column === columnIndex ? "is-sorted" : ""}`}
              onClick={() => toggleSort(columnIndex)}
              aria-label={`Sort by ${label}`}
            >
              <span>{label}</span>
              <span className="table-sort-indicator">{sort?.column === columnIndex ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span>
            </button>
          </th>
        ))}</tr></thead>
        <tbody>
          {visibleRows.length ? visibleRows.map(({ row, index }) => (
            <tr
              className={`data-row ${rowClassName?.(row) ?? ""}`}
              key={row.entityId ?? row.id ?? index}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map(([label, render]) => <td key={label}>{render(row, index) ?? "-"}</td>)}
            </tr>
          )) : <tr><td colSpan={columns.length}>{emptyState}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
