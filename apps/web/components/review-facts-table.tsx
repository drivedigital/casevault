"use client";

/**
 * WS-I (/ai-review) — Accepted facts tab (contract §5.2): "table of facts with
 * review_state + confidence + material flag; row action Approve (the only route
 * to `accepted`), plus reject/defer/dispute and 'Supersede…' with a replacement
 * statement."
 *
 * Floor rule (§4.1): the only Approve affordance in the whole app is the button
 * below, and it calls POST /facts/{id}/approve. No other control here can move a
 * fact to `accepted`; every other state is rendered as "not yet trusted".
 */
import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { inputClass, secondaryButtonClass } from "@/components/field";
import {
  apiErrorMessage,
  FACT_TYPE_LABELS,
  formatConfidence,
  isTrustedReviewState,
  REVIEW_STATE_COPY,
  reviewStateLabel,
  ReviewStateBadge,
  STRENGTH_LABELS_COPY,
  ToggleChip,
} from "@/components/review-labels";
import { FactDetail } from "@/components/review-fact-detail";
import {
  FACT_TYPES,
  REVIEW_STATES,
  type Fact,
  type FactReviewStateTarget,
  type FactType,
  type ReviewState,
} from "@/lib/types";

const PAGE_SIZE = 20;

/** Contract §5.2, verbatim. */
const FACTS_EMPTY_COPY = "No facts yet. Accept a proposal to create one.";

/** States where a fact has already left the review queue for good. */
const CLOSED_STATES: ReviewState[] = ["superseded"];

type Feedback = { tone: "ok" | "error"; message: string };

const rowActionClass =
  "rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function ReviewFactsTable() {
  const qc = useQueryClient();
  const [matterId, setMatterId] = useState("");
  const [states, setStates] = useState<ReviewState[]>([]);
  const [factType, setFactType] = useState<FactType | "">("");
  const [materialOnly, setMaterialOnly] = useState(false);
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [expanded, setExpanded] = useState<{ id: string; supersede: boolean } | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const query = useMemo(
    () => ({
      ...(matterId ? { matter_id: matterId } : {}),
      ...(states.length > 0 ? { review_state: states } : {}),
      ...(factType ? { fact_type: factType } : {}),
      ...(materialOnly ? { is_material: true } : {}),
      ...(q.trim() ? { q: q.trim() } : {}),
      limit: PAGE_SIZE,
      offset,
    }),
    [matterId, states, factType, materialOnly, q, offset],
  );

  const facts = useQuery({ queryKey: ["facts", query], queryFn: () => api.listFacts(query) });
  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api.listMatters() });
  // Two tiny queries give the trusted / awaiting totals the tab header reports.
  const trustedTotal = useQuery({
    queryKey: ["facts", "total", "accepted"],
    queryFn: () => api.listFacts({ review_state: ["accepted"], limit: 1 }),
  });
  const proposedTotal = useQuery({
    queryKey: ["facts", "total", "proposed"],
    queryFn: () => api.listFacts({ review_state: ["proposed"], limit: 1 }),
  });

  const mattersById = useMemo(() => {
    const map = new Map<string, string>();
    for (const matter of matters.data ?? []) map.set(matter.id, matter.name);
    return map;
  }, [matters.data]);

  const invalidateFacts = () => qc.invalidateQueries({ queryKey: ["facts"] });

  const approve = useMutation({
    mutationFn: (id: string) => api.approveFact(id),
    onMutate: (id) => setBusyId(id),
    onSuccess: (fact) => {
      setFeedback((current) => ({
        ...current,
        [fact.id]: {
          tone: "ok",
          message: `Approved — this fact is now \`accepted\` and is part of the trusted set.`,
        },
      }));
      invalidateFacts();
    },
    onError: (error, id) =>
      setFeedback((current) => ({ ...current, [id]: { tone: "error", message: apiErrorMessage(error) } })),
    onSettled: () => setBusyId(null),
  });

  const setState = useMutation({
    mutationFn: ({ id, state }: { id: string; state: FactReviewStateTarget }) =>
      api.setFactReviewState(id, state),
    onMutate: ({ id }) => setBusyId(id),
    onSuccess: (fact, { state }) => {
      setFeedback((current) => ({
        ...current,
        [fact.id]: {
          tone: "ok",
          message: `Marked ${reviewStateLabel(state)} — not trusted. Only POST /facts/{id}/approve \
produces \`accepted\`.`,
        },
      }));
      invalidateFacts();
    },
    onError: (error, { id }) =>
      setFeedback((current) => ({ ...current, [id]: { tone: "error", message: apiErrorMessage(error) } })),
    onSettled: () => setBusyId(null),
  });

  const page = facts.data;
  const items = page?.items ?? [];
  const filtersActive =
    Boolean(matterId) || states.length > 0 || Boolean(factType) || materialOnly || Boolean(q.trim());

  const toggleState = (state: ReviewState) =>
    setStates((current) =>
      current.includes(state) ? current.filter((item) => item !== state) : [...current, state],
    );

  const resetFilters = () => {
    setMatterId("");
    setStates([]);
    setFactType("");
    setMaterialOnly(false);
    setQ("");
    setOffset(0);
  };

  const actionsFor = (fact: Fact) => {
    const closed = CLOSED_STATES.includes(fact.review_state);
    // Approve stays available for anything that is not already approved or
    // closed; the API answers 409 when a state cannot take the action.
    const canApprove = !closed && !isTrustedReviewState(fact.review_state) && fact.review_state !== "accepted_with_edits";
    return { closed, canApprove };
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
      <aside className="space-y-4 self-start rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-900">Filters</h2>
          {filtersActive ? (
            <button type="button" className="text-xs text-blue-700 hover:underline" onClick={resetFilters}>
              Clear
            </button>
          ) : null}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Search statement</span>
          <input
            className={inputClass}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
            placeholder="text in the statement…"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Matter</span>
          <select
            className={inputClass}
            value={matterId}
            onChange={(e) => {
              setMatterId(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All matters</option>
            {(matters.data ?? []).map((matter) => (
              <option key={matter.id} value={matter.id}>
                {matter.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-1 text-xs font-medium text-slate-600">Review state</div>
          <div className="flex flex-wrap gap-1">
            {REVIEW_STATES.map((state) => (
              <ToggleChip
                key={state}
                label={REVIEW_STATE_COPY[state].label}
                active={states.includes(state)}
                title={REVIEW_STATE_COPY[state].hint}
                onClick={() => {
                  toggleState(state);
                  setOffset(0);
                }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <ToggleChip
              label="Trusted only"
              active={states.length === 1 && states[0] === "accepted"}
              title="Sets the filter to review_state=accepted — the set chronology and claims read."
              onClick={() => {
                setStates(["accepted"]);
                setOffset(0);
              }}
            />
            <ToggleChip
              label="Awaiting approval"
              active={states.length === 1 && states[0] === "proposed"}
              onClick={() => {
                setStates(["proposed"]);
                setOffset(0);
              }}
            />
          </div>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Fact type</span>
          <select
            className={inputClass}
            value={factType}
            onChange={(e) => {
              setFactType(e.target.value as FactType | "");
              setOffset(0);
            }}
          >
            <option value="">All types</option>
            {FACT_TYPES.map((type) => (
              <option key={type} value={type}>
                {FACT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={materialOnly}
            onChange={(e) => {
              setMaterialOnly(e.target.checked);
              setOffset(0);
            }}
          />
          Material facts only
        </label>

        {filtersActive ? (
          <button type="button" className={`${secondaryButtonClass} w-full`} onClick={resetFilters}>
            Reset filters
          </button>
        ) : null}
      </aside>

      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
          <span className="font-medium text-green-800">
            Trusted (accepted): {trustedTotal.data?.total ?? "…"}
          </span>
          <span className="mx-2 text-slate-300">·</span>
          <span className="font-medium text-amber-800">
            Awaiting approval (proposed): {proposedTotal.data?.total ?? "…"}
          </span>
          <span className="mx-2 text-slate-300">·</span>
          <span>
            Facts in view: <span className="font-medium text-slate-900">{page?.total ?? "…"}</span>
          </span>
          <p className="mt-1 text-xs text-slate-500">
            Trusted means <span className="font-mono">review_state = accepted</span> — produced only
            by <span className="font-mono">POST /facts/{"{id}"}/approve</span>. Rows in any other
            state (including <span className="font-mono">accepted_with_edits</span>) are shown but
            marked not trusted.
          </p>
        </div>

        {facts.isLoading ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            Loading facts…
          </p>
        ) : facts.isError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
            Could not load facts: {apiErrorMessage(facts.error)}
          </p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
            <p>{FACTS_EMPTY_COPY}</p>
            {filtersActive ? (
              <p className="mt-1 text-xs text-slate-400">
                Filters are active — reset them to see every fact.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium"> </th>
                  <th className="px-3 py-2 font-medium">Fact</th>
                  <th className="px-3 py-2 font-medium">Matter</th>
                  <th className="px-3 py-2 font-medium">Review state</th>
                  <th className="px-3 py-2 font-medium">Confidence</th>
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 font-medium">Support</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((fact) => {
                  const { closed, canApprove } = actionsFor(fact);
                  const isOpen = expanded?.id === fact.id;
                  const trusted = isTrustedReviewState(fact.review_state);
                  return (
                    <Fragment key={fact.id}>
                      <tr
                        className={`border-b border-slate-100 ${
                          trusted
                            ? "bg-green-50/40"
                            : fact.review_state === "proposed"
                              ? "bg-amber-50/40"
                              : "bg-white"
                        }`}
                      >
                        <td className="px-3 py-2 align-top">
                          <button
                            type="button"
                            className={rowActionClass}
                            aria-expanded={isOpen}
                            onClick={() =>
                              setExpanded(isOpen ? null : { id: fact.id, supersede: false })
                            }
                          >
                            {isOpen ? "▾" : "▸"}
                          </button>
                        </td>
                        <td className="max-w-md px-3 py-2 align-top">
                          <div className="font-medium text-slate-900">
                            {fact.short_label ?? fact.statement_text.slice(0, 60)}
                          </div>
                          <div className="text-xs text-slate-600">{fact.statement_text}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                            {fact.id.slice(0, 8)} · {FACT_TYPE_LABELS[fact.fact_type]}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-slate-600">
                          {mattersById.get(fact.matter_id) ?? fact.matter_id.slice(0, 8)}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <ReviewStateBadge state={fact.review_state} />
                          <div
                            className={`mt-0.5 text-[11px] ${
                              trusted ? "text-green-700" : "text-amber-700"
                            }`}
                          >
                            {trusted ? "Trusted — explicitly approved" : "Not yet trusted"}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-slate-600">
                          {fact.confidence_level
                            ? STRENGTH_LABELS_COPY[fact.confidence_level]
                            : formatConfidence(null)}
                        </td>
                        <td className="px-3 py-2 align-top text-xs">
                          {fact.is_material ? (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-800">
                              Material
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top text-xs text-slate-600">
                          {fact.source_links.length} source · {fact.actor_links.length} actor
                        </td>
                        <td className="px-3 py-2 align-top">
                          {closed ? (
                            <span
                              className="text-xs text-slate-400"
                              title="A superseded fact cannot be re-transitioned (contract §4.3)."
                            >
                              closed
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {canApprove ? (
                                <button
                                  type="button"
                                  className="rounded bg-green-700 px-2 py-1 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
                                  disabled={busyId === fact.id}
                                  title="POST /facts/{id}/approve — the only route that makes a fact `accepted` (trusted)."
                                  onClick={() => approve.mutate(fact.id)}
                                >
                                  {approve.isPending && busyId === fact.id ? "Approving…" : "Approve"}
                                </button>
                              ) : (
                                <span
                                  className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800"
                                  title="Already approved/edited — `accepted` is the only trusted state."
                                >
                                  {fact.review_state === "accepted" ? "Approved" : "Reviewed"}
                                </span>
                              )}
                              <button
                                type="button"
                                className={rowActionClass}
                                disabled={busyId === fact.id}
                                onClick={() => setState.mutate({ id: fact.id, state: "rejected" })}
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                className={rowActionClass}
                                disabled={busyId === fact.id}
                                onClick={() => setState.mutate({ id: fact.id, state: "deferred" })}
                              >
                                Defer
                              </button>
                              <button
                                type="button"
                                className={rowActionClass}
                                disabled={busyId === fact.id}
                                onClick={() => setState.mutate({ id: fact.id, state: "disputed" })}
                              >
                                Dispute
                              </button>
                              <button
                                type="button"
                                className={rowActionClass}
                                onClick={() =>
                                  setExpanded(isOpen && expanded.supersede ? null : { id: fact.id, supersede: true })
                                }
                              >
                                Supersede…
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <td colSpan={8} className="px-3 py-3">
                            <FactDetail fact={fact} openSupersede={expanded.supersede} />
                          </td>
                        </tr>
                      ) : null}
                      {feedback[fact.id] ? (
                        <tr>
                          <td colSpan={8} className="px-3 pb-2">
                            <p
                              className={`text-xs ${
                                feedback[fact.id].tone === "ok" ? "text-green-700" : "text-red-600"
                              }`}
                            >
                              {feedback[fact.id].message}
                            </p>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {page && page.total > PAGE_SIZE ? (
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
              {page.offset + items.length} of {page.total}
            </span>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={offset + PAGE_SIZE >= page.total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              Next →
            </button>
          </div>
        ) : null}

        <p className="text-xs text-slate-400">
          Approve is the only trust transition on this screen. Reject / Defer / Dispute are review
          states (<span className="font-mono">POST /facts/{"{id}"}/review-state</span>), not
          approvals.
        </p>
      </div>
    </div>
  );
}
