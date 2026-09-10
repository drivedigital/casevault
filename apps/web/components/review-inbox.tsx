"use client";

/**
 * WS-I (/ai-review) — Inbox tab: the proposal queue (contract §5.2).
 *
 * - filters: type, matter, review state, source, min confidence
 * - card feed with per-card actions (Accept / Accept with edits / Reject /
 *   Defer / Uncertain), bulk select with the same actions
 * - "Generate proposals from a source" control (POST /proposals/generate)
 *
 * Floor rule (§4.1): every action here can only produce facts in `proposed`
 * state. Bulk accept is confirmed against the queue before it runs (UX guardrail
 * for Screen 6: "bulk-accept … only after showing enough context"), and the
 * confirm copy states that nothing becomes trusted.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buttonClass, Field, inputClass, secondaryButtonClass } from "@/components/field";
import { apiErrorMessage } from "@/components/review-labels";
import {
  EMPTY_INBOX_FILTERS,
  InboxFilters,
  proposalQueryFrom,
  type InboxFilterState,
} from "@/components/review-filters";
import {
  ProposalCard,
  type ProposalCardFeedback,
  type ProposalCardSubmission,
} from "@/components/review-proposal-card";
import {
  PROPOSAL_TYPES,
  type ProposalReviewAction,
  type ProposalType,
} from "@/lib/types";

const PAGE_SIZE = 20;

/** Contract §5.2, verbatim. */
const INBOX_EMPTY_COPY =
  "No proposals waiting. Generate proposals from a source or add one manually.";

const BULK_ACTIONS: { action: ProposalReviewAction; label: string }[] = [
  { action: "accept", label: "Accept selected" },
  { action: "reject", label: "Reject" },
  { action: "defer", label: "Defer" },
  { action: "uncertain", label: "Uncertain" },
];

export function ReviewInbox() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<InboxFilterState>(EMPTY_INBOX_FILTERS);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<Record<string, ProposalCardFeedback>>({});
  const [bulkFeedback, setBulkFeedback] = useState<ProposalCardFeedback | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkNotes, setBulkNotes] = useState("");
  const [busyIds, setBusyIds] = useState<string[]>([]);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateSourceId, setGenerateSourceId] = useState("");
  const [generateMax, setGenerateMax] = useState("50");
  const [generateFeedback, setGenerateFeedback] = useState<ProposalCardFeedback | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [newType, setNewType] = useState<ProposalType>("fact");
  const [newMatterId, setNewMatterId] = useState("");
  const [newSourceId, setNewSourceId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [newConfidence, setNewConfidence] = useState("");
  const [createFeedback, setCreateFeedback] = useState<ProposalCardFeedback | null>(null);

  const query = useMemo(
    () => ({ ...proposalQueryFrom(filters), limit: PAGE_SIZE, offset }),
    [filters, offset],
  );

  const proposals = useQuery({
    queryKey: ["proposals", query],
    queryFn: () => api.listProposals(query),
  });
  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api.listMatters() });
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => api.listSources() });

  const mattersById = useMemo(() => {
    const map = new Map<string, string>();
    for (const matter of matters.data ?? []) map.set(matter.id, matter.name);
    return map;
  }, [matters.data]);

  const page = proposals.data;
  const items = page?.items ?? [];
  const filtersActive = JSON.stringify(proposalQueryFrom(filters)) !== "{}";

  const invalidateQueue = () => {
    qc.invalidateQueries({ queryKey: ["proposals"] });
    qc.invalidateQueries({ queryKey: ["facts"] });
  };

  const review = useMutation({
    mutationFn: ({ id, submission }: { id: string; submission: ProposalCardSubmission }) =>
      api.reviewProposal(id, {
        action: submission.action,
        ...(submission.edits ? { edits: submission.edits } : {}),
        review_notes: submission.review_notes ?? null,
      }),
    onMutate: ({ id }) => setBusyIds((ids) => [...ids, id]),
    onSuccess: (result, { id, submission }) => {
      const fact = result.fact;
      const message =
        submission.action === "accept" || submission.action === "accept_with_edits"
          ? `${
              submission.action === "accept_with_edits" ? "Accepted with edits" : "Accepted"
            } — fact${fact ? ` ${fact.id.slice(0, 8)}` : ""} created as \`proposed\`. It is not \
trusted until it is approved in the Accepted facts tab.`
          : `Marked ${submission.action}. The proposal is out of the review queue unless the filter \
includes that state.`;
      setFeedback((current) => ({ ...current, [id]: { tone: "ok", message } }));
      setSelected((ids) => ids.filter((selectedId) => selectedId !== id));
      invalidateQueue();
    },
    onError: (error, { id }) =>
      setFeedback((current) => ({
        ...current,
        [id]: { tone: "error", message: apiErrorMessage(error) },
      })),
    onSettled: (_data, _error, { id }) =>
      setBusyIds((ids) => ids.filter((busyId) => busyId !== id)),
  });

  const bulkReview = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: ProposalReviewAction }) =>
      api.bulkReviewProposals(ids, action, bulkNotes.trim() ? bulkNotes.trim() : null),
    onSuccess: (result, { ids, action }) => {
      const ok = result.results.filter((item) => item.ok).length;
      const failed = result.results.filter((item) => !item.ok);
      const created = result.created_facts?.length ?? 0;
      setBulkFeedback({
        tone: failed.length > 0 ? "error" : "ok",
        message:
          `${ok}/${ids.length} ${action} · ${created} fact(s) created as \`proposed\` (needs approval before it is trusted)` +
          (failed.length > 0
            ? ` · failures: ${failed.map((item) => item.error ?? item.id.slice(0, 8)).join("; ")}`
            : ""),
      });
      setSelected([]);
      setBulkNotes("");
      setConfirmBulk(false);
      invalidateQueue();
    },
    onError: (error) => {
      setBulkFeedback({ tone: "error", message: apiErrorMessage(error) });
      setConfirmBulk(false);
    },
  });

  const generate = useMutation({
    mutationFn: () =>
      api.generateProposals(
        generateSourceId,
        generateMax.trim() && Number.isFinite(Number(generateMax))
          ? Number(generateMax)
          : undefined,
      ),
    onSuccess: (result) => {
      setGenerateFeedback({
        tone: "ok",
        message: result.queued
          ? `Generation queued as a job (${result.job_id ?? "no job id"}) — refresh the queue shortly.`
          : `Generated ${result.created} proposal(s); ${result.skipped} paragraph(s) were already \
proposed and skipped. Every new proposal starts as \`proposed\`.`,
      });
      invalidateQueue();
    },
    onError: (error) =>
      setGenerateFeedback({ tone: "error", message: apiErrorMessage(error) }),
  });

  const createProposal = useMutation({
    mutationFn: () =>
      api.createProposal({
        proposal_type: newType,
        title: newTitle.trim() ? newTitle.trim() : null,
        proposed_text: newText.trim() ? newText.trim() : null,
        ...(newMatterId ? { matter_id: newMatterId } : {}),
        ...(newSourceId ? { source_id: newSourceId } : {}),
        ...(newConfidence.trim() && Number.isFinite(Number(newConfidence))
          ? { confidence_score: Number(newConfidence) }
          : {}),
      }),
    onSuccess: () => {
      setCreateFeedback({
        tone: "ok",
        message: "Proposal created (manual, created_by_system=false). It starts as `proposed`.",
      });
      setNewTitle("");
      setNewText("");
      setNewConfidence("");
      invalidateQueue();
    },
    onError: (error) => setCreateFeedback({ tone: "error", message: apiErrorMessage(error) }),
  });

  const toggleSelected = (id: string, checked: boolean) =>
    setSelected((ids) => {
      if (!checked) return ids.filter((item) => item !== id);
      return ids.includes(id) ? ids : [...ids, id];
    });

  const runBulk = (action: ProposalReviewAction) => bulkReview.mutate({ ids: selected, action });

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
      <InboxFilters
        value={filters}
        onChange={(next) => {
          setFilters(next);
          setOffset(0);
          setSelected([]);
          setBulkFeedback(null);
        }}
        matters={matters.data ?? []}
        sources={sources.data ?? []}
      />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
          <div className="text-sm text-slate-600">
            {page ? (
              <>
                <span className="font-medium text-slate-900">{page.total}</span> proposal(s) in this
                queue · showing {items.length ? page.offset + 1 : 0}–
                {page.offset + items.length}
              </>
            ) : (
              "Loading proposals…"
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setGenerateOpen((open) => !open)}
            >
              {generateOpen ? "Close generator" : "Generate proposals from a source"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => setCreateOpen((open) => !open)}
            >
              {createOpen ? "Close" : "+ Add proposal manually"}
            </button>
          </div>
        </div>

        {generateOpen ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-medium text-slate-900">Generate proposals from a source</h2>
            <p className="mt-1 text-xs text-slate-500">
              POST /proposals/generate — reads the source&apos;s text pages, splits them into
              paragraphs and creates <span className="font-mono">fact</span> proposals. Re-running is
              idempotent (paragraphs already proposed are skipped).
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="min-w-[16rem] flex-1">
                <Field label="Source">
                  <select
                    className={inputClass}
                    value={generateSourceId}
                    onChange={(e) => setGenerateSourceId(e.target.value)}
                  >
                    <option value="">Choose a source…</option>
                    {(sources.data ?? []).map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.title} ({source.source_type})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="w-28">
                <Field label="Max proposals">
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    value={generateMax}
                    onChange={(e) => setGenerateMax(e.target.value)}
                  />
                </Field>
              </div>
              <button
                type="button"
                className={buttonClass}
                disabled={!generateSourceId || generate.isPending}
                onClick={() => generate.mutate()}
              >
                {generate.isPending ? "Generating…" : "Generate proposals"}
              </button>
            </div>
            {generateFeedback ? (
              <p
                className={`mt-2 text-xs ${
                  generateFeedback.tone === "ok" ? "text-green-700" : "text-red-600"
                }`}
              >
                {generateFeedback.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {createOpen ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-medium text-slate-900">Add a proposal manually</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Proposal type">
                <select
                  className={inputClass}
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ProposalType)}
                >
                  {PROPOSAL_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Matter" hint="Facts live inside a matter.">
                <select
                  className={inputClass}
                  value={newMatterId}
                  onChange={(e) => setNewMatterId(e.target.value)}
                >
                  <option value="">(no matter)</option>
                  {(matters.data ?? []).map((matter) => (
                    <option key={matter.id} value={matter.id}>
                      {matter.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Source">
                <select
                  className={inputClass}
                  value={newSourceId}
                  onChange={(e) => setNewSourceId(e.target.value)}
                >
                  <option value="">(no source)</option>
                  {(sources.data ?? []).map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Confidence" hint="0–1, optional.">
                <input
                  className={inputClass}
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={newConfidence}
                  onChange={(e) => setNewConfidence(e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Title">
                  <input
                    className={inputClass}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Short heading for the review queue"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Proposed text">
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                  />
                </Field>
              </div>
            </div>
            <button
              type="button"
              className={`${buttonClass} mt-3`}
              disabled={createProposal.isPending || (!newText.trim() && !newTitle.trim())}
              onClick={() => createProposal.mutate()}
            >
              {createProposal.isPending ? "Creating…" : "Create proposal"}
            </button>
            {createFeedback ? (
              <p
                className={`mt-2 text-xs ${
                  createFeedback.tone === "ok" ? "text-green-700" : "text-red-600"
                }`}
              >
                {createFeedback.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {selected.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-slate-900 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-900">
                {selected.length} selected
              </span>
              {BULK_ACTIONS.map(({ action, label }) => (
                <button
                  key={action}
                  type="button"
                  className={action === "accept" ? buttonClass : secondaryButtonClass}
                  disabled={bulkReview.isPending}
                  onClick={() =>
                    action === "accept" ? setConfirmBulk(true) : runBulk(action)
                  }
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className={`${secondaryButtonClass} cursor-not-allowed opacity-50`}
                disabled
                title="Bulk review has no edits field (contract §4.2) — use “Accept with edits” on a single card."
              >
                Accept with edits
              </button>
              <button
                type="button"
                className="text-xs text-slate-500 hover:underline"
                onClick={() => setSelected([])}
              >
                Clear selection
              </button>
            </div>
            <input
              className={inputClass}
              placeholder="Bulk review note (optional, sent with every action)…"
              value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
            />
            {confirmBulk ? (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-medium">
                  Accept {selected.length} proposal(s) as-is?
                </p>
                <p className="mt-1">
                  This runs POST /proposals/bulk-review with action=accept (no edits). It creates{" "}
                  {selected.length} fact(s) in <span className="font-mono">proposed</span> state —
                  none of them is approved or trusted by this action, and each one still needs an
                  explicit Approve in the Accepted facts tab.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={bulkReview.isPending}
                    onClick={() => runBulk("accept")}
                  >
                    {bulkReview.isPending ? "Accepting…" : `Confirm accept ${selected.length}`}
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    onClick={() => setConfirmBulk(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {bulkFeedback ? (
          <p
            className={`rounded border px-3 py-2 text-xs ${
              bulkFeedback.tone === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {bulkFeedback.message}
          </p>
        ) : null}

        {proposals.isLoading ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            Loading proposals…
          </p>
        ) : proposals.isError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
            Could not load proposals: {apiErrorMessage(proposals.error)}
          </p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            <p>{INBOX_EMPTY_COPY}</p>
            {filtersActive ? (
              <p className="mt-1 text-xs text-slate-400">
                Filters are active — reset them to see the whole queue.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={items.every((item) => selected.includes(item.id))}
                  onChange={(e) => {
                    const pageIds = items.map((item) => item.id);
                    if (e.target.checked) {
                      const additions = pageIds.filter((id) => !selected.includes(id));
                      setSelected([...selected, ...additions]);
                    } else {
                      setSelected(selected.filter((id) => !pageIds.includes(id)));
                    }
                  }}
                />
                Select all on this page
              </label>
              <span>
                Page {Math.floor((page?.offset ?? 0) / PAGE_SIZE) + 1} · {PAGE_SIZE} per page
              </span>
            </div>

            {items.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                matterName={proposal.matter_id ? mattersById.get(proposal.matter_id) ?? null : null}
                matters={matters.data ?? []}
                selected={selected.includes(proposal.id)}
                onSelect={(checked) => toggleSelected(proposal.id, checked)}
                onReview={(submission) => review.mutate({ id: proposal.id, submission })}
                busy={busyIds.includes(proposal.id)}
                feedback={feedback[proposal.id] ?? null}
              />
            ))}

            <div className="flex items-center justify-between">
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                ← Previous
              </button>
              <span className="text-xs text-slate-500">
                {(page?.offset ?? 0) + items.length} of {page?.total ?? items.length}
              </span>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={!page || offset + PAGE_SIZE >= page.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-slate-400">
          Accepting a proposal is a queue decision, not trust: it creates a fact in{" "}
          <span className="font-mono">proposed</span>. Only an explicit Approve in the Accepted facts
          tab puts a fact in the <span className="font-mono">accepted</span> set that{" "}
          <span className="font-mono">GET /facts?review_state=accepted</span> returns.
        </p>
      </div>
    </div>
  );
}
