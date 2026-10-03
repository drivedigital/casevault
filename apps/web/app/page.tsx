import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20 text-center">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
        Legal Matter Intelligence Workspace
      </div>
      <h1 className="mt-2 text-3xl font-black text-slate-900">CaseVault</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500">
        A reviewed proof graph connecting evidence → facts → chronology → <b>claim elements</b> → relief.
        Wave 3 ships the claims matrix; the remaining modules land with their own workstreams.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-3 text-left sm:grid-cols-3">
        <Link
          href="/claims"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow"
        >
          <div className="text-sm font-bold text-slate-900">Claims matrix</div>
          <div className="mt-1 text-xs text-slate-500">Burden-of-proof mapping, element-by-element.</div>
          <div className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            LIVE
          </div>
        </Link>
        {["Evidence", "Chronology", "Relief", "Research", "Tasks"].map((m) => (
          <div key={m} className="rounded-xl border border-dashed border-slate-200 bg-white/50 p-4">
            <div className="text-sm font-bold text-slate-400">{m}</div>
            <div className="mt-1 text-xs text-slate-400">Planned with its own wave.</div>
          </div>
        ))}
      </div>
    </div>
  );
}
