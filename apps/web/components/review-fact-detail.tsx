"use client";

/**
 * WS-I (/ai-review) — expanded fact inspector for the Accepted facts tab
 * (contract §5.2 facts tab + §4.3 link routes; UX Screen 7 "Support"/"Actors"
 * panes). Superseding is offered here because it replaces the statement.
 *
 * Superseding never approves anything: POST /facts/{id}/supersede returns a new
 * fact in `proposed` state and marks the old one `superseded` (§4.3).
 */
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buttonClass, inputClass, secondaryButtonClass } from "@/components/field";
import {
  apiErrorMessage,
  FACT_TYPE_LABELS,
  formatDateTime,
  STRENGTH_LABELS_COPY,
  SUPPORT_TYPE_LABELS,
} from "@/components/review-labels";
import {
  FACT_TYPES,
  STRENGTH_LABELS,
  SUPPORT_TYPES,
  type Fact,
  type FactType,
  type StrengthLabel,
  type SupportType,
} from "@/lib/types";

type Feedback = { tone: "ok" | "error"; message: string } | null;

export function FactDetail({
  fact,
  openSupersede,
}: {
  fact: Fact;
  /** true when the row action "Supersede…" opened this panel */
  openSupersede: boolean;
}) {
  const qc = useQueryClient();
  const sources = useQuery({ queryKey: ["sources"], queryFn: () => api.listSources() });
  const actors = useQuery({ queryKey: ["actors"], queryFn: () => api.listActors() });

  const [sourceId, setSourceId] = useState("");
  const [supportType, setSupportType] = useState<SupportType>("supports");
  const [strength, setStrength] = useState<StrengthLabel | "">("");
  const [actorId, setActorId] = useState("");
  const [roleInFact, setRoleInFact] = useState("");
  const [linkFeedback, setLinkFeedback] = useState<Feedback>(null);

  const [supersedeOpen, setSupersedeOpen] = useState(openSupersede);
  const [supersedeText, setSupersedeText] = useState(fact.statement_text);
  const [supersedeLabel, setSupersedeLabel] = useState(fact.short_label ?? "");
  const [supersedeType, setSupersedeType] = useState<FactType>(fact.fact_type);
  const [supersedeFeedback, setSupersedeFeedback] = useState<Feedback>(null);

  const invalidateFacts = () => qc.invalidateQueries({ queryKey: ["facts"] });

  const addSourceLink = useMutation({
    mutationFn: () =>
      api.addFactSourceLink(fact.id, {
        source_id: sourceId,
        support_type: supportType,
        strength: strength === "" ? null : strength,
      }),
    onSuccess: () => {
      setSourceId("");
      setStrength("");
      setLinkFeedback({ tone: "ok", message: "Source support linked." });
      invalidateFacts();
    },
    onError: (error) => setLinkFeedback({ tone: "error", message: apiErrorMessage(error) }),
  });

  const removeSourceLink = useMutation({
    mutationFn: (linkId: string) => api.deleteFactSourceLink(linkId),
    onSuccess: () => invalidateFacts(),
    onError: (error) => setLinkFeedback({ tone: "error", message: apiErrorMessage(error) }),
  });

  const addActorLink = useMutation({
    mutationFn: () =>
      api.addFactActorLink(fact.id, { actor_id: actorId, role_in_fact: roleInFact || null }),
    onSuccess: () => {
      setActorId("");
      setRoleInFact("");
      setLinkFeedback({ tone: "ok", message: "Actor linked." });
      invalidateFacts();
    },
    onError: (error) => setLinkFeedback({ tone: "error", message: apiErrorMessage(error) }),
  });

  const removeActorLink = useMutation({
    mutationFn: (linkId: string) => api.deleteFactActorLink(linkId),
    onSuccess: () => invalidateFacts(),
    onError: (error) => setLinkFeedback({ tone: "error", message: apiErrorMessage(error) }),
  });

  const supersede = useMutation({
    mutationFn: () =>
      api.supersedeFact(fact.id, {
        statement_text: supersedeText.trim(),
        short_label: supersedeLabel.trim() ? supersedeLabel.trim() : null,
        fact_type: supersedeType,
      }),
    onSuccess: (result) => {
      setSupersedeFeedback({
        tone: "ok",
        message: `Superseded. Replacement fact ${result.new_fact.id.slice(0, 8)} is \`proposed\` — \
it is not trusted until it is approved.`,
      });
      invalidateFacts();
    },
    onError: (error) => setSupersedeFeedback({ tone: "error", message: apiErrorMessage(error) }),
  });

  const sourceTitle = (id: string) => sources.data?.find((item) => item.id === id)?.title ?? id;
  const actorName = (id: string) => actors.data?.find((item) => item.id === id)?.display_name ?? id;

  return (
    <div className="space-y-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs">
      <section>
        <h4 className="font-medium text-slate-700">Statement</h4>
        <p className="mt-1 whitespace-pre-wrap text-slate-800">{fact.statement_text}</p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-slate-500 sm:grid-cols-2">
          <div className="flex gap-1">
            <dt>Created:</dt>
            <dd>{formatDateTime(fact.created_at)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>From proposal:</dt>
            <dd className="font-mono">
              {fact.created_from_proposal
                ? `${fact.created_from_proposal.id.slice(0, 8)} (${fact.created_from_proposal.proposal_type})`
                : "—"}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Approved:</dt>
            <dd>
              {fact.approved_at
                ? `${formatDateTime(fact.approved_at)} by ${fact.approved_by_user_id?.slice(0, 8) ?? "—"}`
                : "not approved"}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Supersedes:</dt>
            <dd className="font-mono">{fact.supersedes_fact_id?.slice(0, 8) ?? "—"}</dd>
          </div>
        </dl>
      </section>

      <section>
        <h4 className="font-medium text-slate-700">
          Source support ({fact.source_links.length})
        </h4>
        {fact.source_links.length === 0 ? (
          <p className="mt-1 text-slate-500">
            No source links yet — every fact should be traceable to evidence.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {fact.source_links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/evidence/${link.source_id}`}
                  className="text-blue-700 hover:underline"
                >
                  {sourceTitle(link.source_id)}
                </Link>
                <span className="text-slate-500">
                  {SUPPORT_TYPE_LABELS[link.support_type]}
                  {link.strength ? ` · ${STRENGTH_LABELS_COPY[link.strength]}` : ""}
                </span>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => removeSourceLink.mutate(link.id)}
                  aria-label="Remove source link"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-slate-600">
            Source
            <select
              className={inputClass}
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
            >
              <option value="">Choose…</option>
              {(sources.data ?? []).map((source) => (
                <option key={source.id} value={source.id}>
                  {source.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-slate-600">
            Support
            <select
              className={inputClass}
              value={supportType}
              onChange={(e) => setSupportType(e.target.value as SupportType)}
            >
              {SUPPORT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="text-slate-600">
            Strength
            <select
              className={inputClass}
              value={strength}
              onChange={(e) => setStrength(e.target.value as StrengthLabel | "")}
            >
              <option value="">(none)</option>
              {STRENGTH_LABELS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={!sourceId || addSourceLink.isPending}
            onClick={() => addSourceLink.mutate()}
          >
            Link source
          </button>
        </div>
      </section>

      <section>
        <h4 className="font-medium text-slate-700">Actors ({fact.actor_links.length})</h4>
        {fact.actor_links.length === 0 ? (
          <p className="mt-1 text-slate-500">No actors linked.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {fact.actor_links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/actors/${link.actor_id}`} className="text-blue-700 hover:underline">
                  {actorName(link.actor_id)}
                </Link>
                <span className="text-slate-500">{link.role_in_fact ?? "—"}</span>
                <button
                  type="button"
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => removeActorLink.mutate(link.id)}
                  aria-label="Remove actor link"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-slate-600">
            Actor
            <select
              className={inputClass}
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
            >
              <option value="">Choose…</option>
              {(actors.data ?? []).map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-slate-600">
            Role in fact
            <input
              className={inputClass}
              value={roleInFact}
              onChange={(e) => setRoleInFact(e.target.value)}
              placeholder="e.g. witness"
            />
          </label>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={!actorId || addActorLink.isPending}
            onClick={() => addActorLink.mutate()}
          >
            Link actor
          </button>
        </div>
      </section>

      {linkFeedback ? (
        <p className={linkFeedback.tone === "ok" ? "text-green-700" : "text-red-600"}>
          {linkFeedback.message}
        </p>
      ) : null}

      <section className="border-t border-slate-200 pt-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-slate-700">Supersede this fact</h4>
          <button
            type="button"
            className="text-slate-500 hover:underline"
            onClick={() => setSupersedeOpen((open) => !open)}
          >
            {supersedeOpen ? "Hide" : "Supersede…"}
          </button>
        </div>
        {supersedeOpen ? (
          <div className="mt-2 space-y-2">
            <p className="text-slate-500">
              The replacement is created as <span className="font-mono">proposed</span> and the
              current fact becomes <span className="font-mono">superseded</span>. Neither state is
              trusted — approve the replacement explicitly.
            </p>
            <textarea
              className={inputClass}
              rows={3}
              value={supersedeText}
              onChange={(e) => setSupersedeText(e.target.value)}
              aria-label="Replacement statement"
            />
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-slate-600">
                Short label
                <input
                  className={inputClass}
                  value={supersedeLabel}
                  onChange={(e) => setSupersedeLabel(e.target.value)}
                />
              </label>
              <label className="text-slate-600">
                Fact type
                <select
                  className={inputClass}
                  value={supersedeType}
                  onChange={(e) => setSupersedeType(e.target.value as FactType)}
                >
                  {FACT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {FACT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={buttonClass}
                disabled={!supersedeText.trim() || supersede.isPending}
                onClick={() => supersede.mutate()}
              >
                {supersede.isPending ? "Superseding…" : "Supersede"}
              </button>
            </div>
            {supersedeFeedback ? (
              <p
                className={supersedeFeedback.tone === "ok" ? "text-green-700" : "text-red-600"}
              >
                {supersedeFeedback.message}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
