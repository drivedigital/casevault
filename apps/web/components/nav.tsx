import Link from "next/link";

export const NAV_ITEMS = [
  { href: "/", label: "Workspace Home" },
  { href: "/matters", label: "Matters" },
  { href: "/actors", label: "Actors" },
  { href: "/evidence", label: "Evidence" },
  { href: "/ledger", label: "Ledger" },
  { href: "/chronology", label: "Chronology" },
  { href: "/claims", label: "Claims" },
  { href: "/relief", label: "Relief" },
  { href: "/research", label: "Research" },
  { href: "/drafting", label: "Drafting" },
  { href: "/ai-review", label: "AI Review" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" },
] as const;

export function Nav() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="text-sm font-semibold tracking-wide text-slate-900">CaseVault</div>
        <div className="text-xs text-slate-500">Legal Matter Intelligence</div>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-400">
        local-first · local identity mode
      </div>
    </aside>
  );
}
