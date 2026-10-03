"use client";

import type { GapRow } from "@/lib/api";

export default function GapPanel({ gaps }: { gaps: GapRow[] }) {
  if (gaps.length === 0) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-700">
        ✓ No open gaps on this chart — every element clears the burden checks.
      </div>
    );
  }
  const alerts = gaps.filter((g) => g.severity === "alert").length;
  const cautions = gaps.filter((g) => g.severity === "caution").length;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Gap analysis</h2>
        <div className="text-[11px] text-slate-500">
          <span className="mr-2 rounded bg-rose-100 px-1.5 py-0.5 font-semibold text-rose-700">{alerts} blocking</span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700">{cautions} to strengthen</span>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {gaps.map((g, i) => (
          <li
            key={`${g.element_id}-${g.code}-${i}`}
            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ring-1 ${
              g.severity === "alert"
                ? "bg-rose-50/70 text-rose-800 ring-rose-100"
                : "bg-amber-50/70 text-amber-800 ring-amber-100"
            }`}
          >
            <span className="mt-0.5 font-mono text-[10px] font-bold opacity-60">E{g.element_order}</span>
            <span className="min-w-0">
              <b>{g.element_label}</b>
              <span className="mx-1 opacity-40">—</span>
              {g.message}
              {g.code !== "attorney_gap_note" ? (
                <span className="ml-1 rounded bg-white/70 px-1 text-[9px] uppercase tracking-wide text-slate-500 ring-1 ring-slate-200">
                  {g.code.replace(/_/g, " ")}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
