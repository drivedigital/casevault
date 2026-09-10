"use client";

import { useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { Badge } from "@/components/badge";
import type { LedgerEntry } from "@/lib/types";

function pretty(value: string) {
  return value.replaceAll("_", " ");
}

function dateLabel(entry: LedgerEntry) {
  if (entry.date_start && entry.date_end && entry.date_start !== entry.date_end) {
    return `${entry.date_start} – ${entry.date_end}`;
  }
  return entry.date_start ?? entry.date_end ?? entry.date_text_raw ?? "—";
}

function badgeColor(value: string | null) {
  if (value === "high" || value === "primary") return "green" as const;
  if (value === "medium" || value === "derived" || value === "testimony") return "blue" as const;
  if (value === "low" || value === "working_note") return "amber" as const;
  return "slate" as const;
}

export function LedgerTable({
  entries,
  selectedIds,
  onSelectedIdsChange,
  onOpen,
}: {
  entries: LedgerEntry[];
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  onOpen: (entry: LedgerEntry) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const allVisibleSelected = entries.length > 0 && entries.every((entry) => selectedIds.has(entry.id));

  const toggleRow = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedIdsChange(next);
  };

  const columns: ColumnDef<LedgerEntry>[] = [
    {
      id: "select",
      header: () => (
        <input
          aria-label="Select all visible ledger entries"
          type="checkbox"
          checked={allVisibleSelected}
          onChange={(event) => {
            const next = new Set(selectedIds);
            entries.forEach((entry) => (event.target.checked ? next.add(entry.id) : next.delete(entry.id)));
            onSelectedIdsChange(next);
          }}
        />
      ),
      cell: ({ row }) => (
        <input
          aria-label={`Select ${row.original.fact_short_name}`}
          type="checkbox"
          checked={selectedIds.has(row.original.id)}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => toggleRow(row.original.id, event.target.checked)}
        />
      ),
      enableSorting: false,
    },
    {
      id: "ledgerId",
      header: "ID",
      accessorFn: (entry) => entry.external_ledger_id ?? entry.id,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-slate-600" title={row.original.id}>
          {row.original.external_ledger_id ?? row.original.id.slice(0, 8)}
        </span>
      ),
    },
    { id: "date", header: "Date", accessorFn: dateLabel, cell: ({ row }) => dateLabel(row.original) },
    {
      accessorKey: "fact_short_name",
      header: "Short name",
      cell: ({ getValue }) => <span className="font-medium text-slate-900">{getValue<string>()}</span>,
    },
    {
      accessorKey: "fact_statement",
      header: "Statement",
      cell: ({ getValue }) => <p className="max-w-xs truncate text-slate-700">{getValue<string>()}</p>,
    },
    {
      accessorKey: "claim_use_text",
      header: "Claim use",
      cell: ({ getValue }) => <p className="max-w-40 truncate text-slate-600">{getValue<string | null>() ?? "—"}</p>,
    },
    {
      id: "sourceLocator",
      header: "Source / locator",
      accessorFn: (entry) => `${entry.linked_source?.title ?? entry.source_path_text ?? ""} ${entry.source_locator_text ?? ""}`,
      cell: ({ row }) => {
        const { linked_source, source_path_text, source_locator_text } = row.original;
        return (
          <div className="max-w-48 text-xs text-slate-600">
            <p className="truncate font-medium text-slate-700">{linked_source?.title ?? source_path_text ?? "—"}</p>
            {source_locator_text ? <p className="truncate text-slate-500">{source_locator_text}</p> : null}
          </div>
        );
      },
    },
    {
      accessorKey: "source_status",
      header: "Status",
      cell: ({ getValue }) => {
        const value = getValue<string | null>();
        return value ? <Badge label={pretty(value)} color={badgeColor(value)} /> : <span className="text-slate-400">—</span>;
      },
    },
    {
      accessorKey: "confidence_level",
      header: "Confidence",
      cell: ({ getValue }) => {
        const value = getValue<string | null>();
        return value ? <Badge label={value} color={badgeColor(value)} /> : <span className="text-slate-400">—</span>;
      },
    },
    {
      accessorKey: "verification_task_text",
      header: "Verification",
      cell: ({ getValue }) => {
        const value = getValue<string | null>();
        return value ? <span className="block max-w-40 truncate text-slate-700">{value}</span> : <span className="text-slate-400">—</span>;
      },
    },
    {
      accessorKey: "tags",
      header: "Tags",
      cell: ({ getValue }) => {
        const tags = getValue<string[]>();
        return tags.length ? (
          <span className="flex max-w-40 flex-wrap gap-1">
            {tags.map((tag) => <Badge key={tag} label={tag} color="slate" />)}
          </span>
        ) : <span className="text-slate-400">—</span>;
      },
    },
  ];

  const table = useReactTable({
    data: entries,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1250px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="whitespace-nowrap px-3 py-3 font-medium">
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="text-slate-400" aria-hidden="true">
                        {header.column.getIsSorted() === "asc" ? "↑" : header.column.getIsSorted() === "desc" ? "↓" : "↕"}
                      </span>
                    </button>
                  ) : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              className={`cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50 ${selectedIds.has(row.original.id) ? "bg-blue-50" : ""}`}
              onClick={() => onOpen(row.original)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-3 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
