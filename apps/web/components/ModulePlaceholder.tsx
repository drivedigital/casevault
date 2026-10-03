import Link from "next/link";

export default function ModulePlaceholder({
  title,
  owner,
  blurb,
}: {
  title: string;
  owner: string;
  blurb: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{blurb}</p>
      <div className="mx-auto mt-6 w-fit rounded-xl border border-dashed border-slate-300 bg-white px-6 py-4 text-xs text-slate-400">
        Placeholder route (Phase 0). This module is owned by <b className="text-slate-500">{owner}</b>.
      </div>
      <div className="mt-8">
        <Link href="/claims" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
          → Go to the live Claims matrix
        </Link>
      </div>
    </div>
  );
}
