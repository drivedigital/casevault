import Link from "next/link";
import type { ClaimRow } from "@/lib/api";
import { BurdenBadge, CoverageBar } from "./BurdenBadge";

export default function ClaimMatrixTable({ claims }: { claims: ClaimRow[] }) {
  if (claims.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        No claims match the current filter. Chart a cause of action with “New claim” to get started.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2.5">Claim</th>
            <th className="px-4 py-2.5">Targets</th>
            <th className="px-4 py-2.5">Burden of proof</th>
            <th className="px-4 py-2.5">Element coverage</th>
            <th className="px-4 py-2.5">Proof links</th>
            <th className="px-4 py-2.5">Authority</th>
            <th className="px-4 py-2.5">Highest-priority gap</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {claims.map((c) => {
            const b = c.burden;
            return (
              <tr key={c.id} className="align-top transition-colors hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link href={`/claims/${c.id}`} className="group block">
                    <div className="flex items-center gap-2">
                      {c.claim_code ? (
                        <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
                          {c.claim_code}
                        </span>
                      ) : null}
                      <span className="font-semibold text-slate-900 group-hover:underline">{c.name}</span>
                    </div>
                    {c.theory_summary ? (
                      <div className="mt-1 max-w-md truncate text-xs text-slate-500">{c.theory_summary}</div>
                    ) : null}
                  </Link>
                </td>
                <td className="max-w-[160px] px-4 py-3 text-xs text-slate-600">
                  {c.target_summary ?? <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  {b ? (
                    <div className="space-y-1">
                      <BurdenBadge status={b.status} explanation={b.explanation} size="sm" />
                      <div className="text-[11px] text-slate-500">
                        {b.proven_elements}/{b.elements_total} elements proven
                        {b.conflicted_elements > 0 ? (
                          <span className="ml-1 text-violet-600">· {b.conflicted_elements} conflicted</span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {b ? <CoverageBar proven={b.proven_elements} partial={b.partial_elements} unsupported={b.unsupported_elements} /> : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">
                  <span className="font-semibold text-emerald-700">{c.support_fact_count}</span>
                  <span className="text-slate-400"> sup · </span>
                  <span className={`font-semibold ${c.adverse_fact_count > 0 ? "text-rose-600" : "text-slate-400"}`}>
                    {c.adverse_fact_count}
                  </span>
                  <span className="text-slate-400"> adv</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {c.authority_verification_state === "verified" ? (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">verified</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">{c.authority_verification_state ?? "pending"}</span>
                  )}
                </td>
                <td className="max-w-[280px] px-4 py-3 text-xs text-slate-600">
                  {c.highest_priority_gap ? (
                    <span className="line-clamp-2">{c.highest_priority_gap}</span>
                  ) : (
                    <span className="text-emerald-600">No open gaps 🎉</span>
                  )}
                  {c.gap_count > 0 && !c.highest_priority_gap ? <span className="text-slate-400"> ({c.gap_count} flagged)</span> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
