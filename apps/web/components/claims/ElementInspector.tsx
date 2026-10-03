"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { claimsApi, type ChartElement } from "@/lib/api";
import { BurdenBadge, SupportPill } from "./BurdenBadge";
import { SOURCE_STATUS_HINT } from "./statusMeta";

type Tab = "support" | "adverse" | "authorities" | "gaps";

export default function ElementInspector({
  element,
  claimId,
  onOpenLink,
}: {
  element: ChartElement | null;
  claimId: string;
  onOpenLink: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("support");
  const [gapDraft, setGapDraft] = useState("");

  useEffect(() => {
    setTab("support");
    setGapDraft(element?.gap_text ?? "");
  }, [element?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["chart", claimId] });
    qc.invalidateQueries({ queryKey: ["claims"] });
  };

  const unlink = useMutation({
    mutationFn: ({ elementId, linkId }: { elementId: string; linkId: string }) =>
      claimsApi.unlinkFact(elementId, linkId),
    onSuccess: invalidate,
  });

  const setWeight = useMutation({
    mutationFn: async ({ elementId, linkId, weight }: { elementId: string; linkId: string; weight: string }) => {
      // Re-link with new weight: remove, then add with the same polarity.
      const chartRes = await claimsApi.getChart(claimId);
      const el = chartRes.elements.find((e) => e.id === elementId);
      const link =
        [...(el?.support_facts ?? []), ...(el?.adverse_facts ?? []), ...(el?.context_facts ?? [])].find(
          (f) => f.link_id === linkId,
        ) ?? null;
      if (!link) return;
      await claimsApi.unlinkFact(elementId, link.link_id);
      await claimsApi.linkFact(elementId, {
        fact_id: link.fact_id,
        link_polarity: link.link_polarity as "support" | "adverse" | "context",
        weight_label: weight ? (weight as "low" | "medium" | "high") : null,
        notes: link.link_notes,
      });
    },
    onSuccess: invalidate,
  });

  const saveGap = useMutation({
    mutationFn: (value: string) => claimsApi.patchElement(element!.id, { gap_text: value.trim() || null }),
    onSuccess: invalidate,
  });

  if (!element) {
    return (
      <aside className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-sm text-slate-400">
        Select an element row to open the inspector: proof links, evidence anchors, authorities and gap notes.
      </aside>
    );
  }

  const factList = (facts: ChartElement["support_facts"], kind: "support" | "adverse" | "context") =>
    facts.length === 0 ? (
      <div className="py-6 text-center text-xs text-slate-400">
        {kind === "support"
          ? "No reviewed facts carry this element yet — link one from the ledger."
          : kind === "adverse"
            ? "No adverse facts. (Good sign — or missing discovery review.)"
            : "No context links."}
      </div>
    ) : (
      <ul className="space-y-3">
        {facts.map((f) => (
          <li key={f.link_id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">{f.short_label ?? "Fact"}</div>
                <p className="prose-note mt-0.5 text-xs text-slate-600">{f.statement_text}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <label className="text-[10px] text-slate-400" title="Link weight drives the points behind the status badge">
                  wt
                  <select
                    className="ml-1 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[11px] font-medium text-slate-700"
                    value={f.weight_label ?? "medium"}
                    disabled={unlink.isPending || setWeight.isPending}
                    onChange={(e) => setWeight.mutate({ elementId: element.id, linkId: f.link_id, weight: e.target.value })}
                  >
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </label>
                <button
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
                  onClick={() => unlink.mutate({ elementId: element.id, linkId: f.link_id })}
                  title="Unlink from element"
                >
                  unlink
                </button>
              </div>
            </div>
            {f.link_notes ? <div className="mt-1 text-[11px] italic text-slate-400">“{f.link_notes}”</div> : null}
            <div className="mt-2 border-t border-slate-100 pt-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Evidence sources ({f.evidence.length})
              </div>
              {f.evidence.length === 0 ? (
                <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-700 ring-1 ring-amber-200">
                  ⚠ Not anchored — this fact rests on notes/memory, not a document.
                </div>
              ) : (
                <ul className="mt-1 space-y-1">
                  {f.evidence.map((ev, i) => (
                    <li key={`${ev.source_id}-${i}`} className="flex items-start gap-2 text-[11px]">
                      <span
                        className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                          ev.is_primary_anchor ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                        title={ev.is_primary_anchor ? "primary / public-record anchor" : "not a primary anchor"}
                      />
                      <div className="min-w-0">
                        <span className="font-medium text-slate-700">{ev.title}</span>
                        <span className="text-slate-400">
                          {" "}
                          · {SOURCE_STATUS_HINT[ev.source_status] ?? ev.source_status} · review: {ev.evidence_review_status.replace(/_/g, " ")}
                        </span>
                        {ev.locator_text ? (
                          <div className="text-slate-400">
                            locator: {ev.locator_text}
                            {ev.page_start ? ` (p. ${ev.page_start}${ev.page_end && ev.page_end !== ev.page_start ? `–${ev.page_end}` : ""})` : ""}
                          </div>
                        ) : null}
                        {ev.excerpt_text ? (
                          <blockquote className="mt-0.5 border-l-2 border-slate-200 pl-2 italic text-slate-500">
                            {ev.excerpt_text}
                          </blockquote>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
    );

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "support", label: "Support facts", count: element.support_facts.length },
    { key: "adverse", label: "Adverse / conflict", count: element.adverse_facts.length + element.context_facts.length },
    { key: "authorities", label: "Authorities", count: element.authorities.length },
    { key: "gaps", label: "Gaps & notes" },
  ];

  return (
    <aside className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-mono text-[10px] text-slate-400">E{element.element_order} · inspector</div>
            <h3 className="text-sm font-bold text-slate-900">{element.element_label}</h3>
          </div>
          <button
            className="rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-700"
            onClick={onOpenLink}
          >
            Link fact…
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SupportPill status={element.computed_support_status} />
          <BurdenBadge status={element.burden_status} size="sm" />
        </div>
        {element.warnings.length > 0 ? (
          <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-100">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Why this status</div>
            {element.warnings.map((w) => (
              <div
                key={w.code}
                className={`flex gap-1.5 text-[11px] ${
                  w.severity === "alert" ? "text-rose-700" : w.severity === "caution" ? "text-amber-700" : "text-slate-500"
                }`}
              >
                <span>•</span>
                <span>{w.message}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-2 rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-700 ring-1 ring-emerald-100">
            ✓ Clean element — anchored support, no conflicts flagged.
          </div>
        )}
      </div>

      <div className="flex border-b border-slate-100 text-[11px]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-2 py-2 font-semibold transition ${
              tab === t.key ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 ? <span className="ml-1 rounded bg-slate-100 px-1 text-slate-500">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "support" ? factList(element.support_facts, "support") : null}
        {tab === "adverse" ? (
          <div className="space-y-4">
            {factList(element.adverse_facts, "adverse")}
            {element.context_facts.length ? <div>{factList(element.context_facts, "context")}</div> : null}
          </div>
        ) : null}
        {tab === "authorities" ? (
          element.authorities.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">
              No authorities linked. Use <code className="rounded bg-slate-100 px-1">POST /api/v1/claim-elements/{"{id}"}/link-authority</code> or the Research module (WS-RELIEF/research wave).
            </div>
          ) : (
            <ul className="space-y-2">
              {element.authorities.map((a) => (
                <li key={a.link_id} className="rounded-lg border border-slate-200 p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">{a.title}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${a.link_type === "controlling" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {a.link_type}
                    </span>
                  </div>
                  {a.citation_text ? <div className="mt-0.5 font-mono text-[11px] text-slate-500">{a.citation_text}</div> : null}
                  {a.holding_summary ? <div className="mt-1 italic text-slate-500">{a.holding_summary}</div> : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
        {tab === "gaps" ? (
          <div className="space-y-3 text-xs">
            <div>
              <div className="mb-1 font-semibold text-slate-600">Attorney gap note (drives the matrix “highest-priority gap”)</div>
              <textarea
                rows={3}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                placeholder="e.g. Need the board consent to prove authority to sign…"
                value={gapDraft}
                onChange={(e) => setGapDraft(e.target.value)}
              />
              <button
                className="mt-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                disabled={saveGap.isPending || gapDraft === (element.gap_text ?? "")}
                onClick={() => saveGap.mutate(gapDraft)}
              >
                {saveGap.isPending ? "Saving…" : "Save gap note"}
              </button>
            </div>
            {element.risk_text ? (
              <div className="rounded-lg bg-rose-50 p-2 text-rose-700 ring-1 ring-rose-100">
                <span className="font-semibold">Risk:</span> {element.risk_text}
              </div>
            ) : null}
            {element.notes ? <div className="rounded-lg bg-slate-50 p-2 text-slate-600">{element.notes}</div> : null}
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
              <div className="rounded bg-slate-50 p-2">support pts <b className="text-slate-800">{element.support_points}</b></div>
              <div className="rounded bg-slate-50 p-2">adverse pts <b className="text-slate-800">{element.adverse_points}</b></div>
              <div className="rounded bg-slate-50 p-2">primary anchor <b className={element.has_primary_anchor ? "text-emerald-600" : "text-rose-600"}>{element.has_primary_anchor ? "yes" : "no"}</b></div>
              <div className="rounded bg-slate-50 p-2">testimony-only <b className={element.testimony_only ? "text-rose-600" : "text-slate-700"}>{element.testimony_only ? "yes" : "no"}</b></div>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
