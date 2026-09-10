"use client";

/**
 * WS-I (/ai-review) — one proposal card in the review queue (contract §5.2:
 * "card feed (type badge, matter, source anchor link to /evidence/{id},
 * proposed text, confidence, linked actors/dates …), action bar per card
 * (Accept, Accept with edits, Reject, Defer, Uncertain)").
 *
 * Floor rule (§4.1): Accept and Accept with edits create a fact in
 * `proposed` state only. This card deliberately has no "approve" affordance —
 * approving happens in the Accepted facts tab via POST /facts/{id}/approve.
 */
import Link from "next/link";
import { useState } from "react";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/field";
import {
  Chip,
  formatConfidence,
  formatDateTime,
  ProposalTypeBadge,
  ReviewStateBadge,
  structuredActors,
  structuredDates,
} from "@/components/review-labels";
import {
  FACT_TYPES,
  STRENGTH_LABELS,
  type FactType,
  type Matter,
  type Proposal,
  type ProposalEdits,
  type ProposalReviewAction,
  type StrengthLabel,
} from "@/lib/types";

export interface ProposalCardSubmission {
  action: ProposalReviewAction;
  edits?: ProposalEdits;
  review_notes?: string | null;
}

export interface ProposalCardFeedback {
  tone: "ok" | "error";
  message: string;
}

/** Re-review is allowed for these states; everything else is a 409 (§4.2). */
const REVIEWABLE_STATES: Proposal["review_state"][] = ["proposed", "deferred", "uncertain"];

export function ProposalCard({
  proposal,
  matterName,
  matters,
  selected,
  onSelect,
  onReview,
  busy,
  feedback,
}: {
  proposal: Proposal;
  matterName: string | null;
  matters: Matter[];
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onReview: (submission: ProposalCardSubmission) => void;
  busy: boolean;
  feedback: ProposalCardFeedback | null;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [statement, setStatement] = useState(proposal.proposed_text ?? "");
  const [shortLabel, setShortLabel] = useState(proposal.title ?? "");
  const [factType, setFactType] = useState<FactType>("source_derived");
  const [confidenceLevel, setConfidenceLevel] = useState<StrengthLabel | "">("");
  const [isMaterial, setIsMaterial] = useState(false);
  const [matterId, setMatterId] = useState(proposal.matter_id ?? "");

  const reviewable = REVIEWABLE_STATES.includes(proposal.review_state);
  const actors = structuredActors(proposal.proposed_structured_json);
  const dates = structuredDates(proposal.proposed_structured_json);
  const sourceHref = proposal.source ? `/evidence/${proposal.source.id}` : null;
  // Facts require a matter (§2 fact_assertions.matter_id NOT NULL). A proposal
  // without one can only be accepted through the edit path, which can set it.
  const needsMatter = !proposal.matter_id;

  const submit = (action: ProposalReviewAction, edits?: ProposalEdits) =>
    onReview({ action, edits, review_notes: notes.trim() ? notes.trim() : null });

  return (
    <article
      className={`rounded-lg border bg-white p-4 ${
        selected ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`Select proposal ${proposal.id}`}
          />
          <ProposalTypeBadge type={proposal.proposal_type} system={proposal.created_by_system} />
          <ReviewStateBadge state={proposal.review_state} />
          {proposal.confidence_score === null ? null : (
            <span className="text-xs text-slate-500">
              confidence {formatConfidence(proposal.confidence_score)}
            </span>
          )}
        </div>
        <div className="text-right text-xs text-slate-400">
          <div>{formatDateTime(proposal.created_at)}</div>
          <div className="font-mono">{proposal.id.slice(0, 8)}</div>
        </div>
      </header>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>Matter:</span>
        {proposal.matter_id ? (
          <Link
            href={`/matters/${proposal.matter_id}`}
            className="text-blue-700 hover:underline"
          >
            {matterName ?? proposal.matter_id}
          </Link>
        ) : (
          <span className="text-amber-700">no matter (a fact needs one)</span>
        )}
        <span className="text-slate-300">·</span>
        <span>Source anchor:</span>
        {sourceHref ? (
          <Link href={sourceHref} className="text-blue-700 hover:underline">
            {proposal.source?.title ?? "open source"}
          </Link>
        ) : (
          <span className="text-slate-400">none</span>
        )}
        {proposal.excerpt ? (
          <>
            <span className="text-slate-300">·</span>
            <span>
              excerpt
              {proposal.excerpt.page_start !== null
                ? ` pp. ${proposal.excerpt.page_start}${
                    proposal.excerpt.page_end && proposal.excerpt.page_end !== proposal.excerpt.page_start
                      ? `–${proposal.excerpt.page_end}`
                      : ""
                  }`
                : ""}
              {proposal.excerpt.locator_text ? ` · ${proposal.excerpt.locator_text}` : ""}
            </span>
          </>
        ) : null}
      </div>

      {proposal.title ? (
        <h3 className="mt-3 text-sm font-medium text-slate-900">{proposal.title}</h3>
      ) : null}

      <p className="mt-2 whitespace-pre-wrap rounded border border-slate-100 bg-slate-50 p-3 text-sm text-slate-800">
        {proposal.proposed_text?.trim() ? proposal.proposed_text : "No proposed text."}
      </p>

      {actors.length > 0 || dates.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {actors.length > 0 ? (
            <>
              <span className="text-xs text-slate-400">Linked actors</span>
              {actors.map((actor) => (
                <Chip key={`actor-${actor}`} value={actor} />
              ))}
            </>
          ) : null}
          {dates.length > 0 ? (
            <>
              <span className="ml-2 text-xs text-slate-400">Dates</span>
              {dates.map((date) => (
                <Chip key={`date-${date}`} value={date} />
              ))}
            </>
          ) : null}
        </div>
      ) : null}

      {reviewable ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={busy || needsMatter}
              title={
                needsMatter
                  ? "This proposal has no matter and a fact must belong to one — use “Accept with edits” to pick a matter."
                  : "Accept as-is (POST /proposals/{id}/review, action=accept). The fact it creates is `proposed`, not approved."
              }
              onClick={() => submit("accept")}
            >
              Accept
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => setEditOpen((open) => !open)}
            >
              {editOpen ? "Cancel edits" : "Accept with edits"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => submit("reject")}
            >
              Reject
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => submit("defer")}
            >
              Defer
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => submit("uncertain")}
            >
              Uncertain
            </button>
            <button
              type="button"
              className="text-xs text-slate-500 hover:underline"
              onClick={() => setNotesOpen((open) => !open)}
            >
              {notesOpen ? "Hide review note" : notes.trim() ? "Review note ✓" : "Add review note"}
            </button>
          </div>

          {notesOpen ? (
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Review notes (sent with the review action, optional)…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          ) : null}

          {editOpen ? (
            <div className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-medium text-slate-600">
                Edit before accepting — this text becomes the fact statement.
              </div>
              <textarea
                className={inputClass}
                rows={3}
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                aria-label="Statement text"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-600">
                  Short label
                  <input
                    className={inputClass}
                    value={shortLabel}
                    onChange={(e) => setShortLabel(e.target.value)}
                  />
                </label>
                <label className="text-xs text-slate-600">
                  Fact type
                  <select
                    className={inputClass}
                    value={factType}
                    onChange={(e) => setFactType(e.target.value as FactType)}
                  >
                    {FACT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  Confidence level
                  <select
                    className={inputClass}
                    value={confidenceLevel}
                    onChange={(e) => setConfidenceLevel(e.target.value as StrengthLabel | "")}
                  >
                    <option value="">(unchanged)</option>
                    {STRENGTH_LABELS.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  Matter
                  <select
                    className={inputClass}
                    value={matterId}
                    onChange={(e) => setMatterId(e.target.value)}
                  >
                    <option value="">{needsMatter ? "Choose a matter…" : "(proposal's matter)"}</option>
                    {matters.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={isMaterial}
                  onChange={(e) => setIsMaterial(e.target.checked)}
                />
                Material to the matter
              </label>
              <button
                type="button"
                className={buttonClass}
                disabled={busy || !statement.trim() || (needsMatter && !matterId)}
                onClick={() =>
                  submit("accept_with_edits", {
                    statement_text: statement.trim(),
                    short_label: shortLabel.trim() ? shortLabel.trim() : null,
                    fact_type: factType,
                    confidence_level: confidenceLevel === "" ? null : confidenceLevel,
                    is_material: isMaterial,
                    ...(matterId ? { matter_id: matterId } : {}),
                  })
                }
              >
                Save + accept
              </button>
              {needsMatter && !matterId ? (
                <p className="text-xs text-amber-700">
                  Pick a matter — facts cannot exist outside one (contract §2).
                </p>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-slate-400">
            Accepting creates a <span className="font-mono">proposed</span> fact. It becomes trusted
            only when it is approved in the Accepted facts tab.
          </p>
        </div>
      ) : (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Already reviewed ({proposal.review_state}). Re-review is rejected with 409 for states other
          than proposed / deferred / uncertain (contract §4.2).
        </p>
      )}

      {proposal.created_fact_id ? (
        <p className="mt-2 text-xs text-slate-600">
          Created fact <span className="font-mono">{proposal.created_fact_id.slice(0, 8)}</span> — it
          is <span className="font-mono">proposed</span> until approved (Accepted facts tab).
        </p>
      ) : null}

      {feedback ? (
        <p
          className={`mt-2 text-xs ${
            feedback.tone === "ok" ? "text-green-700" : "text-red-600"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </article>
  );
}
