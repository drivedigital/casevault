export function ModulePlaceholder({
  title,
  summary,
  planned,
}: {
  title: string;
  summary: string;
  planned: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          Planned — not built yet
        </span>
      </div>
      <p className="mb-6 text-sm leading-6 text-slate-600">{summary}</p>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-medium text-slate-900">Planned for this module</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-xs text-slate-400">
        This route is a Phase 0 navigation placeholder. Build order lives in
        handoff/BACKLOG.md; screen details in docs/specs/…_UX_Spec.md.
      </p>
    </div>
  );
}
