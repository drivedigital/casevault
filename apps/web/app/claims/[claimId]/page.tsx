"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { claimsApi } from "@/lib/api";
import { BurdenBadge } from "@/components/claims/BurdenBadge";
import ElementInspector from "@/components/claims/ElementInspector";
import ElementMatrix from "@/components/claims/ElementMatrix";
import GapPanel from "@/components/claims/GapPanel";
import LinkFactDialog from "@/components/claims/LinkFactDialog";

export default function ClaimChartPage() {
  const params = useParams<{ claimId: string }>();
  const claimId = params.claimId;
  const router = useRouter();
  const qc = useQueryClient();
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const { data: chart, error, isLoading } = useQuery({
    queryKey: ["chart", claimId],
    queryFn: () => claimsApi.getChart(claimId),
    refetchOnMount: "always",
  });

  const recompute = useMutation({
    mutationFn: () => claimsApi.recompute(claimId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["chart", claimId] });
      qc.invalidateQueries({ queryKey: ["claims"] });
    },
  });

  const remove = useMutation({
    mutationFn: () => claimsApi.deleteClaim(claimId),
    onSuccess: () => router.push("/claims"),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-400">Loading chart…</div>;
  }
  if (error || !chart) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-rose-600">Claim chart unavailable: {(error as Error)?.message ?? "not found"}</p>
        <Link href="/claims" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          ← Back to matrix
        </Link>
      </div>
    );
  }

  const c = chart.claim;
  const selected = chart.elements.find((e) => e.id === selectedElement) ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="flex items-center justify-between text-xs">
        <Link href="/claims" className="font-semibold text-slate-500 hover:text-slate-800">
          ← Claims matrix
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => recompute.mutate()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            title="Re-derive every element's support status from the proof graph (Tech Spec §10.3)"
          >
            {recompute.isPending ? "Recomputing…" : "↻ Recompute support"}
          </button>
          <button
            onClick={() => {
              if (confirm("Delete this claim and its element links?")) remove.mutate();
            }}
            className="rounded-lg px-3 py-1.5 font-semibold text-rose-600 hover:bg-rose-50"
          >
            Delete claim
          </button>
        </div>
      </div>

      {/* Claim header (UX Spec Screen 10) */}
      <header className="mt-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {c.claim_code ? (
                <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">{c.claim_code}</span>
              ) : null}
              <h1 className="text-xl font-bold text-slate-900">{c.name}</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-500 ring-1 ring-slate-200">
                {c.status ?? "working"}
              </span>
            </div>
            {c.target_summary ? <div className="mt-1 text-xs text-slate-500">vs. {c.target_summary}</div> : null}
            {c.theory_summary ? <p className="mt-2 max-w-3xl text-sm text-slate-600">{c.theory_summary}</p> : null}
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
              <span>
                Authority verification:{" "}
                <b className={c.authority_verification_state === "verified" ? "text-emerald-600" : "text-amber-600"}>
                  {c.authority_verification_state ?? "pending"}
                </b>
              </span>
              <span>
                Elements: <b>{chart.burden.elements_total}</b>
              </span>
              <span>
                Open gaps: <b className={chart.gaps.length ? "text-rose-600" : "text-emerald-600"}>{chart.gaps.length}</b>
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <BurdenBadge status={chart.burden.status} explanation={chart.burden.explanation} />
            <p className="max-w-[300px] text-right text-[11px] leading-4 text-slate-500">{chart.burden.explanation}</p>
            {c.highest_priority_gap ? (
              <p className="max-w-[300px] rounded-lg bg-rose-50 px-2.5 py-1.5 text-right text-[11px] text-rose-700 ring-1 ring-rose-100">
                <b>Top gap:</b> {c.highest_priority_gap}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <ElementMatrix
            elements={chart.elements}
            selectedId={selectedElement}
            onSelect={(id) => setSelectedElement((prev) => (prev === id ? null : id))}
          />
          <GapPanel gaps={chart.gaps} />
        </div>
        <ElementInspector
          element={selected}
          claimId={claimId}
          onOpenLink={() => {
            if (selected) setLinking(true);
          }}
        />
      </div>

      {linking && selected ? (
        <LinkFactDialog elementId={selected.id} elementLabel={selected.element_label} onClose={() => setLinking(false)} />
      ) : null}
    </div>
  );
}
