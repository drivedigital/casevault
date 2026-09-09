import Link from "next/link";
import { NAV_ITEMS } from "@/components/nav";

export default function WorkspaceHome() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Workspace Home</h1>
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
          Phase 0 scaffold
        </span>
      </div>
      <p className="mb-6 max-w-2xl text-sm leading-6 text-slate-600">
        CaseVault is a local-first legal matter intelligence workspace. This is the Phase 0
        scaffold: navigation shell and placeholder routes only. Feature build-out begins in
        Phase 1 (workspace, matters, proceedings, actors). See
        {" "}<code className="rounded bg-slate-200 px-1">handoff/BACKLOG.md</code> for priority.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_ITEMS.filter((i) => i.href !== "/").map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm"
          >
            <div className="text-sm font-medium text-slate-900">{item.label}</div>
            <div className="mt-1 text-xs text-slate-400">Planned module — placeholder route</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
