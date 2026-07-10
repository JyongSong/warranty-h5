"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnOrderState,
  type ColumnSizingState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  getBackofficeTableColumnHeaderLabel,
  getBackofficeTableLeafColumnIds,
  normalizeTablePreferenceColumnOrder,
  normalizeTablePreferenceSorting,
  parseTablePreferences,
  stringifyTablePreferences,
} from "@/lib/backoffice/table-controls";

type BackofficeDataTableProps<TData> = {
  columns: ColumnDef<TData>[];
  data: TData[];
  emptyMessage: string;
  storageKey: string;
  defaultSorting?: SortingState;
  getRowClassName?: (row: TData) => string;
  getRowId?: (row: TData, index: number) => string;
  cellClassName?: string;
  toolbarLeading?: ReactNode;
  beforeTable?: ReactNode;
  renderBeforeTable?: (columnControls: ReactNode) => ReactNode;
  lockedLeadingColumnIds?: string[];
};

const DEFAULT_SORTING_STATE: SortingState = [];
const DEFAULT_LOCKED_LEADING_COLUMN_IDS: string[] = [];

export default function BackofficeDataTable<TData>({
  columns,
  data,
  emptyMessage,
  storageKey,
  defaultSorting = DEFAULT_SORTING_STATE,
  getRowClassName,
  getRowId,
  cellClassName = "align-top px-4 py-3 text-zinc-700",
  toolbarLeading,
  beforeTable,
  renderBeforeTable,
  lockedLeadingColumnIds = DEFAULT_LOCKED_LEADING_COLUMN_IDS,
}: BackofficeDataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSorting);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [showColumnVisibilityPopup, setShowColumnVisibilityPopup] = useState(false);
  const [showColumnOrderPopup, setShowColumnOrderPopup] = useState(false);
  const preferencesLoadedRef = useRef(false);
  const nonHideableColumnIds = useMemo(() => new Set(getNonHideableColumnIds(columns)), [columns]);
  const lockedLeadingColumnIdSet = useMemo(() => new Set(lockedLeadingColumnIds), [lockedLeadingColumnIds]);

  useEffect(() => {
    const preferences = parseTablePreferences(window.localStorage.getItem(storageKey));
    const currentColumnIds = getBackofficeTableLeafColumnIds(columns);

    if (preferences.columnVisibility) {
      setColumnVisibility(sanitizeColumnVisibility(preferences.columnVisibility, nonHideableColumnIds));
    }
    if (preferences.columnOrder) {
      setColumnOrder(
        normalizeTablePreferenceColumnOrder(preferences.columnOrder, currentColumnIds, lockedLeadingColumnIds),
      );
    }
    if (preferences.columnSizing) setColumnSizing(preferences.columnSizing);
    if (preferences.sorting) {
      setSorting(normalizeTablePreferenceSorting(preferences.sorting, currentColumnIds));
    } else {
      setSorting(normalizeTablePreferenceSorting(defaultSorting, currentColumnIds));
    }

    preferencesLoadedRef.current = true;
  }, [columns, defaultSorting, lockedLeadingColumnIds, nonHideableColumnIds, storageKey]);

  const handleColumnVisibilityChange: typeof setColumnVisibility = (updater) => {
    setColumnVisibility((currentVisibility) => {
      const nextVisibility =
        typeof updater === "function" ? updater(currentVisibility) : updater;

      return sanitizeColumnVisibility(nextVisibility, nonHideableColumnIds);
    });
  };

  useEffect(() => {
    if (!preferencesLoadedRef.current) return;

    window.localStorage.setItem(
      storageKey,
      stringifyTablePreferences({
        columnVisibility,
        columnOrder,
        columnSizing,
        sorting,
      }),
    );
  }, [columnOrder, columnSizing, columnVisibility, sorting, storageKey]);

  /* eslint-disable react-hooks/incompatible-library */
  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnVisibility, columnSizing, columnOrder },
    onSortingChange: setSorting,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onColumnSizingChange: setColumnSizing,
    onColumnOrderChange: setColumnOrder,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
  });
  /* eslint-enable react-hooks/incompatible-library */
  const orderedColumns = table.getAllLeafColumns();
  const moveColumnOrder = (columnId: string, direction: "up" | "down") => {
    setColumnOrder((currentOrder) => {
      const currentColumnIds = table.getAllLeafColumns().map((column) => column.id);
      const orderedColumnIds = normalizeTablePreferenceColumnOrder(
        currentOrder.length ? currentOrder : currentColumnIds,
        currentColumnIds,
        lockedLeadingColumnIds,
      );
      const index = orderedColumnIds.indexOf(columnId);
      if (index < 0) return orderedColumnIds;
      if (lockedLeadingColumnIdSet.has(columnId)) return orderedColumnIds;

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= orderedColumnIds.length) return orderedColumnIds;
      if (targetIndex < lockedLeadingColumnIds.length) return orderedColumnIds;

      const nextColumnOrder = [...orderedColumnIds];
      [nextColumnOrder[index], nextColumnOrder[targetIndex]] = [
        nextColumnOrder[targetIndex],
        nextColumnOrder[index],
      ];
      return nextColumnOrder;
    });
  };

  const columnControls = (
    <div className="flex shrink-0 justify-end gap-2">
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowColumnVisibilityPopup((current) => !current);
            setShowColumnOrderPopup(false);
          }}
          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950"
          aria-expanded={showColumnVisibilityPopup}
        >
          컬럼 선택
        </button>
        {showColumnVisibilityPopup ? (
          <div className="absolute right-0 z-20 mt-2 w-64 rounded-md border border-zinc-200 bg-white p-3 shadow-lg">
            <div className="mb-2 text-xs font-semibold text-zinc-500">컬럼 표시 설정</div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {table
                .getAllLeafColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <label key={column.id} className="flex items-center gap-2 text-sm text-zinc-700">
                    <input
                      type="checkbox"
                      checked={column.getIsVisible()}
                      disabled={
                        column.getIsVisible() &&
                        table.getVisibleLeafColumns().filter((visibleColumn) => visibleColumn.getCanHide()).length ===
                          1
                      }
                      onChange={column.getToggleVisibilityHandler()}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    <span>{getBackofficeTableColumnHeaderLabel(column.columnDef.header)}</span>
                  </label>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowColumnOrderPopup((current) => !current);
            setShowColumnVisibilityPopup(false);
          }}
          className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:text-zinc-950"
          aria-expanded={showColumnOrderPopup}
        >
          컬럼 순서
        </button>
        {showColumnOrderPopup ? (
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-md border border-zinc-200 bg-white p-3 shadow-lg">
            <div className="mb-2 text-xs font-semibold text-zinc-500">컬럼 순서 설정</div>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {orderedColumns.map((column, index) => (
                <div
                  key={column.id}
                  className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm text-zinc-700"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {getBackofficeTableColumnHeaderLabel(column.columnDef.header)}
                  </span>
                  <button
                    type="button"
                    disabled={index === 0 || lockedLeadingColumnIdSet.has(column.id)}
                    onClick={() => moveColumnOrder(column.id, "up")}
                    className="h-7 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    위로
                  </button>
                  <button
                    type="button"
                    disabled={index === orderedColumns.length - 1 || lockedLeadingColumnIdSet.has(column.id)}
                    onClick={() => moveColumnOrder(column.id, "down")}
                    className="h-7 rounded-md border border-zinc-300 px-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    아래로
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const shouldRenderToolbar = toolbarLeading || !renderBeforeTable;

  return (
    <>
      {shouldRenderToolbar ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {toolbarLeading ? <div className="min-w-0">{toolbarLeading}</div> : <div />}
          {renderBeforeTable ? <div /> : columnControls}
        </div>
      ) : null}
      {renderBeforeTable?.(columnControls) ?? beforeTable}
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div className="overflow-x-auto">
          <table
            className="w-max min-w-full table-fixed border-collapse text-left text-sm whitespace-nowrap"
            style={{ width: getTableWidth(table.getVisibleLeafColumns()) }}
          >
            <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      aria-sort={getAriaSort(header.column.getIsSorted())}
                      className="relative border-b border-zinc-200 px-4 py-3"
                      style={getColumnSizeStyle(getColumnRenderSize(header.column))}
                    >
                      {header.isPlaceholder ? null : (
                        <div className="flex items-center gap-2 pr-2">
                          {header.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={() => header.column.toggleSorting()}
                              className="inline-flex items-center gap-1 font-semibold text-zinc-600 transition hover:text-zinc-950"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              <span className="min-w-3 text-[10px] text-zinc-400" aria-hidden="true">
                                {getSortIndicator(header.column.getIsSorted())}
                              </span>
                            </button>
                          ) : (
                            <div className="inline-flex items-center gap-1 font-semibold text-zinc-600">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                            </div>
                          )}
                        </div>
                      )}
                      <div
                        onMouseDown={(event) => {
                          event.stopPropagation();
                          header.getResizeHandler()(event);
                        }}
                        onTouchStart={(event) => {
                          event.stopPropagation();
                          header.getResizeHandler()(event);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className="absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none bg-transparent hover:bg-zinc-300"
                        aria-hidden="true"
                      />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan={table.getVisibleLeafColumns().length} className="p-0">
                    <div className="sticky left-0 flex h-24 w-[calc(100vw-2rem)] max-w-full items-center justify-center px-4 text-sm text-zinc-500">
                      {emptyMessage}
                    </div>
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={getRowClassName?.(row.original) ?? "border-b border-zinc-100 last:border-0 hover:bg-zinc-50"}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cellClassName}
                        style={getColumnSizeStyle(getColumnRenderSize(cell.column))}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function getNonHideableColumnIds<TData>(columnDefs: ColumnDef<TData>[]): string[] {
  return columnDefs.flatMap((column) => {
    const childColumns = (column as { columns?: ColumnDef<TData>[] }).columns;
    if (childColumns) return getNonHideableColumnIds(childColumns);
    if ((column as { enableHiding?: boolean }).enableHiding !== false) return [];

    const columnId = getColumnDefId(column);
    return columnId ? [columnId] : [];
  });
}

function getColumnDefId<TData>(column: ColumnDef<TData>) {
  const columnWithId = column as { id?: string; accessorKey?: string | number };
  if (columnWithId.id) return columnWithId.id;
  if (typeof columnWithId.accessorKey === "string" || typeof columnWithId.accessorKey === "number") {
    return String(columnWithId.accessorKey);
  }
  return null;
}

function sanitizeColumnVisibility(columnVisibility: VisibilityState, nonHideableColumnIds: Set<string>) {
  let nextColumnVisibility: VisibilityState | null = null;

  for (const columnId of nonHideableColumnIds) {
    if (columnVisibility[columnId] === false) {
      nextColumnVisibility ??= { ...columnVisibility };
      delete nextColumnVisibility[columnId];
    }
  }

  return nextColumnVisibility ?? columnVisibility;
}

function getColumnRenderSize(column: { getSize: () => number; columnDef: { minSize?: number } }) {
  return Math.max(column.getSize(), column.columnDef.minSize ?? 0);
}

function getColumnSizeStyle(size: number) {
  return {
    width: size,
    minWidth: size,
    maxWidth: size,
  };
}

function getTableWidth(visibleColumns: Array<{ getSize: () => number; columnDef: { minSize?: number } }>) {
  return visibleColumns.reduce((width, column) => width + getColumnRenderSize(column), 0);
}

function getAriaSort(sortDirection: false | "asc" | "desc") {
  if (sortDirection === "asc") return "ascending";
  if (sortDirection === "desc") return "descending";
  return "none";
}

function getSortIndicator(sortDirection: false | "asc" | "desc") {
  if (sortDirection === "asc") return "▲";
  if (sortDirection === "desc") return "▼";
  return "↕";
}
