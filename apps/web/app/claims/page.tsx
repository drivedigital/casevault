"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { claimsApi, listMatters, type BurdenStatus } from "@/lib/api";
import ClaimMatrixTable from "@/components/claims/ClaimMatrixTable";
import NewClaimDialog from "@/components/claims/NewClaimDialog";

const FILTERS: { key: BurdenStatus | "all" | "gaps"; label: string }[] = [
  { key: "all", label: "All claims" },
  { key: "unsupported", label: "Unsupported" },
  { key: "partially_supported", label: "Partially supported" },
  { key: "proven", label: "Proven" },
  { key: "gaps", label: "Has open gaps" },
];

export default function ClaimsMatrixPage() {
  const [matterId, setMatterId] = useState<string>("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const qc = useQueryClient();

  const { data: matters = [] } = useQuery({ queryKey: ["matters"], queryFn: listMatters });
  const activeMatter = matterId || matters[0]?.id || "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["claims", activeMatter],
    queryFn: () => claimsApi.listClaims({ matter_id: activeMatter }),
    enabled: !!activeMatter,
  });

  const rows = useMemo(() => {
    let items = data?.items ?? [];
    if (filter === "gaps") items = items.filter((c) => c.gap_count > 0 || !!c.highest_priority_gap);
    else if (filter !== "all") items = items.filter((c) => c.burden?.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter((c) =>
        [c.name, c.claim_code ?? "", c.target_summary ?? ""].join(" ").toLowerCase().includes(q),
      );
    }
    return items;
  }, [data, filter, search]);

  const summary = data?.items ?? [];

  if (matters.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-slate-500">
        No matters exist yet. Matters are owned by WS-MATTERS; seed the dev database
        (<code className="rounded bg-slate-100 px-1">cd apps/api && python -m app.seed_dev</code>) to try the claims matrix.
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Claim chart workspace
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Legal claims matrix</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Every cause of action, element by element, mapped to accepted facts and the evidence behind
            them — with burden-of-proof status and open gaps.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-500">
            Matter
            <select
              className="mt-1 ml-2 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
              value={activeMatter}
              onChange={(e) => {
                setMatterId(e.target.value);
                qc.invalidateQueries({ queryKey: ["matters"] });
              }}
            >
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-700"
            onClick={() => setShowNew(true)}
          >
            + New claim
          </button>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count =
            f.key === "all"
              ? summary.length
              : f.key === "gaps"
                ? summary.filter((c) => c.gap_count > 0 || !!c.highest_priority_gap).length
                : summary.filter((c) => c.burden?.status === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                active
                  ? "bg-slate-900 text-white ring-slate-900"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {f.label} <span className={active ? "text-slate-300" : "text-slate-400"}>{count}</span>
            </button>
          );
        })}
        <input
          className="ml-auto w-56 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none placeholder:text-slate-400 focus:border-slate-400"
          placeholder="Search name / code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mt-4">
        {isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
            Loading claim chart…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            Could not reach the API — is <code>uvicorn app.main:app</code> running? ({(error as Error).message})
          </div>
        ) : (
          <ClaimMatrixTable claims={rows} />
        )}
      </div>

      {showNew && activeMatter ? <NewClaimDialog matterId={activeMatter} onClose={() => setShowNew(false)} /> : null}
    </div>
  );
}
