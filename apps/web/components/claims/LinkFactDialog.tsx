"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { claimsApi, type LinkPolarity, type WeightLabel } from "@/lib/api";

export default function LinkFactDialog({
  elementId,
  elementLabel,
  onClose,
}: {
  elementId: string;
  elementLabel: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ["candidates", elementId],
    queryFn: () => claimsApi.candidates(elementId),
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [polarity, setPolarity] = useState<LinkPolarity>("support");
  const [weight, setWeight] = useState<WeightLabel | "">("");
  const [notes, setNotes] = useState("");

  const link = useMutation({
    mutationFn: () =>
      claimsApi.linkFact(elementId!, {
        fact_id: picked!,
        link_polarity: polarity,
        weight_label: weight || null,
        notes: notes.trim() || null,
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["chart"] }),
        qc.invalidateQueries({ queryKey: ["claims"] }),
        qc.invalidateQueries({ queryKey: ["candidates", elementId] }),
      ]);
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-slate-900/40 p-4 pt-16" onClick={onClose}>
      <div
        className="max-h-[75vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">Link reviewed facts to “{elementLabel}”</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Candidate accepted facts for this matter, ranked by term overlap and evidence anchoring.
            The burden engine recomputes automatically after linking.
          </p>
        </div>
        <div className="max-h-[42vh] overflow-y-auto px-5 py-3">
          {isLoading ? <div className="py-8 text-center text-sm text-slate-400">Scanning fact ledger…</div> : null}
          {!isLoading && candidates.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">
              No unlinked accepted facts in this matter yet — facts arrive via the review queue (WS-FACTS).
            </div>
          ) : null}
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li key={c.fact_id}>
                <button
                  onClick={() => setPicked(c.fact_id === picked ? null : c.fact_id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    picked === c.fact_id ? "border-sky-400 bg-sky-50/60 ring-1 ring-sky-300" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{c.short_label ?? c.statement_text.slice(0, 60)}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{c.statement_text}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-slate-500">
                        {c.evidence_sources.map((s) => (
                          <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5">📄 {s}</span>
                        ))}
                        {c.is_material ? <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-600">material</span> : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="rounded-md bg-slate-900 px-2 py-1 font-mono text-[11px] font-bold text-white">+{c.score}</div>
                      <ul className="mt-1 w-40 text-[10px] leading-3 text-slate-400">
                        {c.score_reasons.map((r) => (
                          <li key={r}>· {r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs">
          <label>
            <span className="font-semibold text-slate-600">Polarity</span>
            <select className="ml-1 rounded-md border border-slate-300 bg-white px-2 py-1" value={polarity} onChange={(e) => setPolarity(e.target.value as LinkPolarity)}>
              <option value="support">supports element</option>
              <option value="adverse">adverse / conflicting</option>
              <option value="context">context only</option>
            </select>
          </label>
          <label>
            <span className="font-semibold text-slate-600">Weight</span>
            <select className="ml-1 rounded-md border border-slate-300 bg-white px-2 py-1" value={weight} onChange={(e) => setWeight(e.target.value as WeightLabel)} style={{ colorScheme: "light" }}>
              <option value="">medium (default)</option>
              <option value="low">low (1 pt)</option>
              <option value="medium">medium (2 pts)</option>
              <option value="high">high (3 pts)</option>
            </select>
          </label>
          <input
            className="min-w-[160px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1"
            placeholder="Link note (why this fact matters)…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="ml-auto flex gap-2">
            <button className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-200" onClick={onClose}>
              Cancel
            </button>
            <button
              disabled={!picked || link.isPending}
              onClick={() => link.mutate()}
              className="rounded-md bg-slate-900 px-3.5 py-1.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
            >
              {link.isPending ? "Linking…" : "Attach to element"}
            </button>
          </div>
          {link.isError ? (
            <div className="w-full rounded-md bg-rose-50 px-2 py-1 text-rose-700">{(link.error as Error).message}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
