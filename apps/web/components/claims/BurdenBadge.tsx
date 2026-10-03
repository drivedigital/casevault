import type { BurdenStatus, SupportStatus } from "@/lib/api";
import { BURDEN_META, SUPPORT_META } from "./statusMeta";

export function BurdenBadge({
  status,
  explanation,
  size = "md",
}: {
  status: BurdenStatus;
  explanation?: string;
  size?: "sm" | "md";
}) {
  const meta = BURDEN_META[status];
  return (
    <span
      title={explanation ?? meta.hint}
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ${meta.badge} ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

export function SupportPill({ status }: { status: SupportStatus }) {
  const meta = SUPPORT_META[status];
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${meta.pill}`}>
      {meta.label}
    </span>
  );
}

export function CoverageBar({
  proven,
  partial,
  unsupported,
}: {
  proven: number;
  partial: number;
  unsupported: number;
}) {
  const total = Math.max(proven + partial + unsupported, 1);
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-2 w-full min-w-[96px] overflow-hidden rounded-full bg-slate-200" title={`${proven} proven · ${partial} partial · ${unsupported} unsupported`}>
      <div className="bg-emerald-500" style={{ width: pct(proven) }} />
      <div className="bg-amber-400" style={{ width: pct(partial) }} />
      <div className="bg-rose-400" style={{ width: pct(unsupported) }} />
    </div>
  );
}
