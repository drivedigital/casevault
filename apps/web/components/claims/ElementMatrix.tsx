"use client";

import type { ChartElement } from "@/lib/api";
import { BurdenBadge, SupportPill } from "./BurdenBadge";

function AlertIcon({ severity }: { severity: string }) {
  const cls =
    severity === "alert"
      ? "bg-rose-100 text-rose-700"
      : severity === "caution"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-500";
  return <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${cls}`}>!</span>;
}

export default function ElementMatrix({
  elements,
  selectedId,
  onSelect,
}: {
  elements: ChartElement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2">Element</th>
            <th className="px-3 py-2">Support status</th>
            <th className="px-3 py-2">Burden</th>
            <th className="px-3 py-2 text-center">Facts sup / adv</th>
            <th className="px-3 py-2 text-center">Evidence</th>
            <th className="px-3 py-2 text-center">Authority</th>
            <th className="px-3 py-2">Gap / notes</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {elements.map((el) => {
            const alerts = el.warnings.filter((w) => w.severity !== "info");
            const selected = el.id === selectedId;
            return (
              <tr
                key={el.id}
                onClick={() => onSelect(el.id)}
                className={`cursor-pointer align-top transition-colors ${
                  selected ? "bg-sky-50/70 ring-1 ring-inset ring-sky-200" : "hover:bg-slate-50"
                }`}
              >
                <td className="max-w-[260px] px-4 py-2.5">
                  <div className="font-semibold text-slate-800">
                    <span className="mr-1.5 font-mono text-[11px] text-slate-400">E{el.element_order}</span>
                    {el.element_label}
                  </div>
                  {el.element_description ? (
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{el.element_description}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <SupportPill status={el.computed_support_status} />
                  {el.stored_support_status !== el.computed_support_status ? (
                    <div className="mt-0.5 text-[10px] text-slate-400">stored: {el.stored_support_status.replace(/_/g, " ")}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <BurdenBadge status={el.burden_status} size="sm" />
                </td>
                <td className="px-3 py-2.5 text-center text-xs">
                  <span className="font-semibold text-emerald-700">{el.support_facts.length}</span>
                  <span className="text-slate-300"> / </span>
                  <span className={`font-semibold ${el.adverse_facts.length ? "text-rose-600" : "text-slate-400"}`}>
                    {el.adverse_facts.length}
                  </span>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    {el.support_points} pts{el.adverse_points ? ` · −${el.adverse_points} adv` : ""}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center">
                  {el.has_primary_anchor ? (
                    <span title="Anchored in a primary or public-record source" className="text-emerald-600">●</span>
                  ) : el.testimony_only ? (
                    <span title="Testimony-only support" className="text-rose-500">▲</span>
                  ) : (
                    <span title="No primary source anchor" className="text-slate-300">○</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center text-[11px]">
                  {el.has_controlling_authority ? (
                    <span className="text-emerald-700" title="Controlling/persuasive authority linked">§ ✓</span>
                  ) : el.authorities.length > 0 ? (
                    <span className="text-slate-500" title="Only background/open-question authorities">§</span>
                  ) : (
                    <span className="text-slate-300" title="No authority linked">—</span>
                  )}
                </td>
                <td className="max-w-[240px] px-3 py-2.5 text-xs text-slate-600">
                  {el.gap_text ? <div className="line-clamp-2">{el.gap_text}</div> : null}
                  {alerts.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {alerts.slice(0, 3).map((w) => (
                        <span key={w.code} title={w.message}>
                          <AlertIcon severity={w.severity} />
                        </span>
                      ))}
                      <span className="text-slate-400">{alerts.length} open</span>
                    </div>
                  ) : !el.gap_text ? (
                    <span className="text-emerald-600">clear</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
