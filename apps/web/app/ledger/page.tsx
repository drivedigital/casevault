"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  bulkLedger,
  createLedgerEntry,
  deleteLedgerEntry,
  ledgerExportUrl,
  linkLedgerSource,
  listLedgerEntries,
  updateLedgerEntry,
} from "@/lib/api";
import { buttonClass, secondaryButtonClass } from "@/components/field";
import { LedgerBulkActions } from "@/components/ledger-bulk-actions";
import { LedgerDrawer } from "@/components/ledger-drawer";
import { EMPTY_LEDGER_FILTERS, LedgerFilters, type LedgerFilterValues } from "@/components/ledger-filters";
import { LedgerImportDialog } from "@/components/ledger-import-dialog";
import { LedgerTable } from "@/components/ledger-table";
import type { LedgerEntry, LedgerEntryInput, LedgerImportResult, LedgerListParams } from "@/lib/types";
import { api } from "@/lib/api";

const PAGE_SIZE = 50;

function apiMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

interface DrawerState {
  open: boolean;
  entry: LedgerEntry | null;
}

export default function LedgerPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<LedgerFilterValues>(EMPTY_LEDGER_FILTERS);
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, entry: null });
  const [importOpen, setImportOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listParams = useMemo<LedgerListParams>(() => ({
    ...(filters.matterId ? { matter_id: filters.matterId } : {}),
    ...(filters.sourceStatus ? { source_status: filters.sourceStatus } : {}),
    ...(filters.confidenceLevel ? { confidence_level: filters.confidenceLevel } : {}),
    ...(filters.tag.trim() ? { tag: filters.tag.trim() } : {}),
    ...(filters.hasVerificationTask ? { has_verification_task: filters.hasVerificationTask === "true" } : {}),
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    limit: PAGE_SIZE,
    offset,
  }), [filters, offset]);

  const exportParams = useMemo<LedgerListParams>(() => {
    const { limit: _limit, offset: _offset, ...activeFilters } = listParams;
    return activeFilters;
  }, [listParams]);

  const entries = useQuery({
    queryKey: ["ledger-entries", listParams],
    queryFn: () => listLedgerEntries(listParams),
  });
  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api.listMatters() });
  const sources = useQuery({ queryKey: ["sources", "ledger-linker"], queryFn: () => api.listSources() });

  const invalidateLedger = async () => {
    await queryClient.invalidateQueries({ queryKey: ["ledger-entries"] });
  };

  const saveEntry = useMutation({
    mutationFn: async ({ entry, payload, linkedSourceId }: { entry: LedgerEntry | null; payload: LedgerEntryInput; linkedSourceId: string }) => {
      const { linked_source_id: _linkedSourceId, ...entryPayload } = payload;
      if (entry) {
        const sourceWasRemoved = !linkedSourceId && entry.linked_source_id;
        const saved = await updateLedgerEntry(
          entry.id,
          sourceWasRemoved ? { ...entryPayload, linked_source_id: null } : entryPayload,
        );
        if (linkedSourceId && linkedSourceId !== entry.linked_source_id) {
          return linkLedgerSource(saved.id, linkedSourceId);
        }
        return saved;
      }

      const created = await createLedgerEntry(entryPayload);
      return linkedSourceId ? linkLedgerSource(created.id, linkedSourceId) : created;
    },
    onSuccess: async () => {
      setActionError(null);
      setNotice(drawer.entry ? "Ledger row saved." : "Ledger row created.");
      setDrawer({ open: false, entry: null });
      await invalidateLedger();
    },
    onError: (error) => setActionError(apiMessage(error, "Could not save this ledger row.")),
  });

  const removeEntry = useMutation({
    mutationFn: (id: string) => deleteLedgerEntry(id),
    onSuccess: async () => {
      setActionError(null);
      setNotice("Ledger row deleted.");
      setDrawer({ open: false, entry: null });
      await invalidateLedger();
    },
    onError: (error) => setActionError(apiMessage(error, "Could not delete this ledger row.")),
  });

  const applyBulk = useMutation({
    mutationFn: (patch: Parameters<typeof bulkLedger>[1]) => bulkLedger(Array.from(selectedIds), patch),
    onSuccess: async (result) => {
      setSelectedIds(new Set());
      setActionError(null);
      setNotice(`Updated ${result.updated} row${result.updated === 1 ? "" : "s"}; ${result.skipped} skipped.`);
      await invalidateLedger();
    },
    onError: (error) => setActionError(apiMessage(error, "Could not apply the bulk change.")),
  });

  const changeFilters = (next: LedgerFilterValues) => {
    setFilters(next);
    setOffset(0);
    setSelectedIds(new Set());
  };
  const page = entries.data;
  const firstShown = page?.total ? page.offset + 1 : 0;
  const lastShown = page ? Math.min(page.offset + page.items.length, page.total) : 0;
  const hasPrevious = offset > 0;
  const hasNext = Boolean(page && page.offset + page.items.length < page.total);

  const handleImported = async (result: LedgerImportResult) => {
    setNotice(`CSV import complete: ${result.created} created and ${result.skipped} skipped.`);
    await invalidateLedger();
  };

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Source ledger</h1>
          <p className="mt-1 text-sm text-slate-600">Maintain the evidence log without returning to a spreadsheet.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={secondaryButtonClass} href={ledgerExportUrl(exportParams)} download>
            Export CSV
          </a>
          <button type="button" className={secondaryButtonClass} onClick={() => setImportOpen(true)}>Import CSV</button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              setActionError(null);
              setDrawer({ open: true, entry: null });
            }}
          >
            + New row
          </button>
        </div>
      </div>

      {notice ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800" role="status">
          <span>{notice}</span>
          <button type="button" className="font-medium hover:underline" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      ) : null}
      {actionError && !drawer.open ? <p role="alert" className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]">
        <LedgerFilters
          filters={filters}
          matters={matters.data ?? []}
          onChange={changeFilters}
          onClear={() => changeFilters(EMPTY_LEDGER_FILTERS)}
        />

        <section className="min-w-0">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <p className="text-sm text-slate-600">
                {entries.isLoading ? "Loading ledger entries…" : `Showing ${firstShown}–${lastShown} of ${page?.total ?? 0} rows`}
              </p>
              <p className="text-xs text-slate-500">Click a column heading to sort. Click a row to edit it.</p>
            </div>
            {entries.isError ? (
              <p role="alert" className="px-4 py-8 text-sm text-red-700">{apiMessage(entries.error, "Could not load ledger entries.")}</p>
            ) : entries.isLoading ? (
              <p className="px-4 py-8 text-sm text-slate-500">Loading…</p>
            ) : (page?.items.length ?? 0) === 0 ? (
              <div className="px-4 py-10 text-sm text-slate-600">
                <p>Add your first ledger row or import a CSV to start the evidence log.</p>
                {(filters.q || filters.matterId || filters.sourceStatus || filters.confidenceLevel || filters.tag || filters.hasVerificationTask) ? (
                  <button type="button" className="mt-2 text-sm font-medium text-blue-700 hover:underline" onClick={() => changeFilters(EMPTY_LEDGER_FILTERS)}>Clear filters</button>
                ) : null}
              </div>
            ) : (
              <LedgerTable
                entries={page?.items ?? []}
                selectedIds={selectedIds}
                onSelectedIdsChange={setSelectedIds}
                onOpen={(entry) => {
                  setActionError(null);
                  setDrawer({ open: true, entry });
                }}
              />
            )}
          </div>

          {page && page.total > PAGE_SIZE ? (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button type="button" className={secondaryButtonClass} disabled={!hasPrevious} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
              <button type="button" className={secondaryButtonClass} disabled={!hasNext} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
            </div>
          ) : null}

          <LedgerBulkActions
            selectedCount={selectedIds.size}
            busy={applyBulk.isPending}
            onApply={(patch) => applyBulk.mutate(patch)}
            onClear={() => setSelectedIds(new Set())}
          />
        </section>
      </div>

      <LedgerDrawer
        open={drawer.open}
        entry={drawer.entry}
        matters={matters.data ?? []}
        sources={sources.data ?? []}
        saving={saveEntry.isPending}
        deleting={removeEntry.isPending}
        error={actionError}
        onClose={() => {
          if (!saveEntry.isPending && !removeEntry.isPending) {
            setActionError(null);
            setDrawer({ open: false, entry: null });
          }
        }}
        onSave={(payload, linkedSourceId) => saveEntry.mutate({ entry: drawer.entry, payload, linkedSourceId })}
        onDelete={(entry) => {
          if (window.confirm(`Delete “${entry.fact_short_name}”? This cannot be undone.`)) removeEntry.mutate(entry.id);
        }}
      />
      <LedgerImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={handleImported} />
    </div>
  );
}
