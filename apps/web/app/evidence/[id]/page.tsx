"use client";

// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0).
// This page is the single owner of ALL detail behavior (Status, downloads,
// PDF preview, errors, OCR refresh). Composition:
//   lib/evidence-detail-drafts.ts      — Status-tab draft lifecycle
//   lib/evidence-detail-files.ts       — download / opt-in preview fetches
//   lib/evidence-detail-ocr-poll.ts    — bounded OCR source-status polling
//   components/evidence-detail-*       — viewer, status panel, matters, errors
//
// Contract highlights (§EU-D.1–6): distinct error surfaces with retry for
// source/pages/matters/link/unlink/update (never a false empty view);
// explicit fetch-backed Download original for every type; PDF preview that
// cannot trigger the attachment endpoint's download on page load; honest OCR
// 202 feedback with 2s/120s polling, terminal refresh, timeout → manual
// refresh, and cancellation on navigation/unmount; targeted cache
// invalidation that leaves ledger/intake queries alone.

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import type { SourceMatterLink } from "@/lib/types";
import { SourceReviewBadge, SourceStatusBadge } from "@/components/source-badge";
import { Badge } from "@/components/badge";
import { Field, secondaryButtonClass } from "@/components/field";
import { ErrorNote, WarningNote } from "@/components/evidence-detail-error";
import { DownloadOriginalButton } from "@/components/evidence-detail-download-button";
import { EvidenceViewer } from "@/components/evidence-detail-viewer";
import {
  EvidenceStatusPanel,
  type ReprocessResult,
  type SourceUpdatePayload,
} from "@/components/evidence-detail-status-panel";
import { EvidenceMattersPanel } from "@/components/evidence-detail-matters";
import { useSourceDrafts } from "@/lib/evidence-detail-drafts";
import { useOcrWatch } from "@/lib/evidence-detail-ocr-poll";
import { describeError } from "@/lib/evidence-detail-errors";

type TabKey = "metadata" | "ocr" | "matters" | "status";

const TABS: { key: TabKey; label: string }[] = [
  { key: "metadata", label: "Metadata" },
  { key: "ocr", label: "OCR" },
  { key: "matters", label: "Matters" },
  { key: "status", label: "Status" },
];

export default function EvidenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id =
    typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const [tab, setTab] = useState<TabKey>("metadata");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveRevisionRef = useRef(0);

  // Query failures surface immediately with an explicit retry (contract
  // §EU-D.4) — react-query's automatic retry would hide them for ~15s.
  const noRetry = { retry: false as const };
  const source = useQuery({
    queryKey: ["source", id],
    queryFn: () => api.getSource(id),
    enabled: !!id,
    ...noRetry,
  });
  const pages = useQuery({
    queryKey: ["pages", id],
    queryFn: () => api.listSourcePages(id),
    enabled: !!id,
    ...noRetry,
  });
  const matters = useQuery({
    queryKey: ["source-matters", id],
    queryFn: () => api.listSourceMatters(id),
    enabled: !!id,
    ...noRetry,
  });
  const allMatters = useQuery({
    queryKey: ["matters"],
    queryFn: () => api.listMatters(),
    ...noRetry,
  });

  const drafts = useSourceDrafts(source.data);

  /** Refresh the source-detail and source-list views (and pages when asked).
   *  Ledger/intake queries are deliberately never touched (§EU-D.6). */
  const invalidateSourceViews = useCallback(
    (opts?: { pages?: boolean }) => {
      if (!id) return;
      void qc.invalidateQueries({ queryKey: ["source", id] });
      void qc.invalidateQueries({ queryKey: ["sources"] });
      if (opts?.pages) void qc.invalidateQueries({ queryKey: ["pages", id] });
    },
    [qc, id],
  );

  const update = useMutation({
    mutationFn: (payload: SourceUpdatePayload) => api.updateSource(id, payload),
    onSuccess: (data, payload) => {
      // Adopt the server's response immediately (no stale flash), then let
      // the invalidations confirm it everywhere the source is shown.
      qc.setQueryData(["source", id], data);
      invalidateSourceViews();
      if (payload.title !== undefined || payload.source_status !== undefined) {
        // Reconcile the drafts only when the user has not edited since the
        // save was issued — a slow response must not overwrite newer edits.
        if (drafts.reconcileIf(saveRevisionRef.current)) {
          setSavedAt(Date.now());
        }
      }
    },
  });

  const ocrWatch = useOcrWatch({
    sourceId: id,
    onTerminal: () => invalidateSourceViews({ pages: true }),
  });

  const reprocess = useMutation({
    mutationFn: () => api.reprocessSource(id, ["ocr"]),
    onSuccess: (data: ReprocessResult) => {
      // 202 = accepted, NOT completed (contract §EU-D.5).
      if (data.queued) {
        // Watch the persisted source status; the loop is bounded (2s/120s)
        // and cancels itself on navigation/unmount/terminal/timeout.
        ocrWatch.start(data.job_id);
      }
      // queued:false → show the reason, never start a poll, never claim
      // success. The server still flipped the stage status to "queued", so
      // refresh the source views to stay honest about persisted state.
      invalidateSourceViews();
    },
  });

  const link = useMutation({
    mutationFn: (matterId: string) => api.linkSourceToMatter(matterId, id),
    onSuccess: (_data: SourceMatterLink, matterId: string) => {
      void qc.invalidateQueries({ queryKey: ["source-matters", id] });
      void qc.invalidateQueries({ queryKey: ["matter-sources", matterId] });
      void qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const unlink = useMutation({
    mutationFn: (vars: { linkId: string; matterId: string }) =>
      api.deleteSourceMatterLink(vars.linkId),
    onSuccess: (_data: void, vars: { linkId: string; matterId: string }) => {
      void qc.invalidateQueries({ queryKey: ["source-matters", id] });
      void qc.invalidateQueries({ queryKey: ["matter-sources", vars.matterId] });
      void qc.invalidateQueries({ queryKey: ["sources"] });
    },
  });

  const handleSave = () => {
    if (!source.data || !drafts.initialized || !drafts.valid || update.isPending) return;
    saveRevisionRef.current = drafts.revision();
    setSavedAt(null);
    update.mutate({
      title: drafts.title.trim(),
      source_status: drafts.status as SourceUpdatePayload["source_status"],
    });
  };

  const handleReprocess = () => {
    if (!reprocess.isPending) reprocess.mutate();
  };

  const refreshAll = useCallback(() => {
    void source.refetch();
    void pages.refetch();
    void matters.refetch();
    void allMatters.refetch();
  }, [source, pages, matters, allMatters]);

  if (!id) return <div className="p-6 text-red-600">Invalid source id.</div>;

  if (source.isLoading) {
    return <div className="p-6 text-sm text-slate-500">Loading source…</div>;
  }

  // Full error state ONLY when no data exists at all. A failed BACKGROUND
  // refetch keeps the last loaded data (labeled as stale below) — an
  // unreachable API must not turn a loaded source into a broken page
  // (contract §EU-D.4: no false empty/healthy views, and no false broken
  // views either).
  if (!source.data) {
    const notFound = source.error instanceof ApiError && source.error.status === 404;
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <button
          type="button"
          onClick={() => router.push("/evidence")}
          className="text-sm text-blue-700 hover:underline"
        >
          ← Back to evidence
        </button>
        <ErrorNote
          title={notFound ? "Source not found" : "Couldn't load source"}
          message={
            notFound
              ? "This source doesn't exist in the current workspace (or was removed). This is a load failure, not an empty source."
              : `${
                  source.error ? describeError(source.error) : "Unknown error."
                } Check that the API is running, then retry.`
          }
          onRetry={() => void source.refetch()}
          pending={source.isFetching}
        />
      </div>
    );
  }

  const s = source.data;
  const pageList = pages.data ?? [];
  const firstPageText = pageList.length > 0 ? (pageList[0].ocr_text ?? "") : null;

  return (
    <div className="mx-auto max-w-6xl">
      <button
        type="button"
        onClick={() => router.push("/evidence")}
        className="mb-4 text-sm text-blue-700 hover:underline"
      >
        ← Back to evidence
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {s.title || s.original_filename || "Untitled source"}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{s.source_type}</span>
            <span>·</span>
            <span>{s.mime_type}</span>
            <span>·</span>
            <span>{(s.file_size_bytes ?? 0).toLocaleString()} bytes</span>
            <span>·</span>
            <Badge
              label={`processing: ${s.processing_status}`}
              color={s.processing_status === "failed" ? "red" : "slate"}
            />
            <Badge
              label={`ocr: ${s.ocr_status}`}
              color={
                s.ocr_status === "complete"
                  ? "green"
                  : s.ocr_status === "failed"
                    ? "red"
                    : s.ocr_status === "skipped"
                      ? "slate"
                      : "amber"
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={refreshAll}
            className={`${secondaryButtonClass} text-xs`}
            title="Refetch the source, pages and linked matters"
          >
            Refresh
          </button>
          <DownloadOriginalButton source={s} />
          <button
            type="button"
            onClick={() => {
              drafts.resetFromServer();
              setTab("status");
            }}
            className={`${secondaryButtonClass} text-xs`}
          >
            Edit
          </button>
        </div>
      </div>

      {source.isError ? (
        <div className="mb-4" data-testid="source-stale">
          <WarningNote title="Source refresh failed — showing the last loaded version.">
            <span>
              {source.error ? describeError(source.error) : "Unknown error."}{" "}
              <button
                type="button"
                className="font-medium underline"
                onClick={() => void source.refetch()}
                disabled={source.isFetching}
              >
                {source.isFetching ? "Retrying…" : "Retry"}
              </button>
            </span>
          </WarningNote>
        </div>
      ) : null}

      {s.duplicate_of && (
        <div className="mb-4 rounded bg-amber-100 px-3 py-2 text-sm text-amber-800">
          Duplicate of{" "}
          <Link href="/evidence" className="font-medium underline">
            {s.duplicate_of.title}
          </Link>
        </div>
      )}

      <EvidenceViewer
        source={s}
        firstPageText={firstPageText}
        pagesLoaded={pages.data !== undefined}
        pagesError={pages.isError ? describeError(pages.error) : null}
        pagesPending={pages.isFetching}
        onRetryPages={() => void pages.refetch()}
      />

      {/* Inspector tabs */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex border-b border-slate-200">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key}
              className={`px-4 py-2.5 text-sm font-medium ${
                tab === t.key
                  ? "border-b-2 border-blue-600 text-blue-700"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "metadata" && (
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <Field label="Title">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {s.title || "—"}
                </div>
              </Field>
              <Field label="Filename">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {s.original_filename || "—"}
                </div>
              </Field>
              <Field label="Mime type">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {s.mime_type || "—"}
                </div>
              </Field>
              <Field label="Storage path">
                <div className="rounded border border-slate-300 bg-white px-3 py-2 break-all text-xs">
                  {s.storage_path}
                </div>
              </Field>
              <Field label="SHA-256">
                <div className="rounded border border-slate-300 bg-white px-3 py-2 break-all text-xs">
                  {s.sha256 || "—"}
                </div>
              </Field>
              <Field label="Page count">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {s.page_count ?? "—"}
                </div>
              </Field>
              <Field label="Source status">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  <SourceStatusBadge status={s.source_status} />
                </div>
              </Field>
              <Field label="Review status">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  <SourceReviewBadge status={s.evidence_review_status} />
                </div>
              </Field>
              <Field label="Processing status">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {s.processing_status}
                </div>
              </Field>
              <Field label="OCR status">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {s.ocr_status}
                </div>
              </Field>
              <Field label="Included">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {s.included_flag ? "Yes" : "No"}
                </div>
              </Field>
              <Field label="Excluded">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {s.excluded_flag ? "Yes" : "No"}
                </div>
              </Field>
              <Field label="Created">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {new Date(s.created_at).toLocaleString()}
                </div>
              </Field>
              <Field label="Updated">
                <div className="rounded border border-slate-300 bg-white px-3 py-2">
                  {new Date(s.updated_at).toLocaleString()}
                </div>
              </Field>
            </div>
          )}

          {tab === "ocr" && (
            <div className="space-y-3" data-testid="ocr-tab">
              <h3 className="text-sm font-medium text-slate-800">Pages with OCR text</h3>
              {pages.isError && !pages.data ? (
                <ErrorNote
                  title="Couldn't load pages"
                  message={`${
                    pages.error ? describeError(pages.error) : "Unknown error."
                  } This is a load failure, not "no pages extracted".`}
                  onRetry={() => void pages.refetch()}
                  pending={pages.isFetching}
                />
              ) : pages.isLoading ? (
                <p className="text-sm text-slate-500">Loading pages…</p>
              ) : (
                <>
                  {pages.isError && pages.data ? (
                    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Pages refresh failed — showing the last loaded pages.{" "}
                      <button
                        type="button"
                        className="font-medium underline"
                        onClick={() => void pages.refetch()}
                        disabled={pages.isFetching}
                      >
                        {pages.isFetching ? "Retrying…" : "Retry"}
                      </button>
                    </div>
                  ) : null}
                  {pageList.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No pages extracted yet. Text-like files get a page from the ingest
                      worker; PDF/image files need OCR (see Reprocess OCR on the Status
                      tab).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {pageList.map((p) => (
                        <div
                          key={p.id}
                          className="rounded border border-slate-100 bg-slate-50 p-2"
                        >
                          <div className="mb-1 text-xs text-slate-500">
                            Page {p.page_number} {p.page_label ? `(${p.page_label})` : ""}
                          </div>
                          <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">
                            {p.ocr_text ?? "(no text)"}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === "matters" && (
            <EvidenceMattersPanel links={matters} allMatters={allMatters} link={link} unlink={unlink} />
          )}

          {tab === "status" && (
            <EvidenceStatusPanel
              source={s}
              drafts={drafts}
              update={update}
              savedAt={savedAt}
              onSave={handleSave}
              reprocess={reprocess}
              onReprocess={handleReprocess}
              ocrWatch={ocrWatch.watch}
              ocrWatchError={ocrWatch.error}
              onManualRefresh={refreshAll}
            />
          )}
        </div>
      </div>
    </div>
  );
}
