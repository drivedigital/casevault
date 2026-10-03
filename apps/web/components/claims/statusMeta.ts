import type { BurdenStatus, SupportStatus } from "@/lib/api";

/** Shared burden-of-proof vocabulary for badges, dots and filters. */

export const BURDEN_META: Record<
  BurdenStatus,
  { label: string; badge: string; dot: string; hint: string }
> = {
  unsupported: {
    label: "Unsupported",
    badge: "bg-rose-100 text-rose-800 ring-rose-200",
    dot: "bg-rose-500",
    hint: "No element carries the burden yet",
  },
  partially_supported: {
    label: "Partially supported",
    badge: "bg-amber-100 text-amber-800 ring-amber-200",
    dot: "bg-amber-400",
    hint: "Some elements carry, others need proof work",
  },
  proven: {
    label: "Proven (facially)",
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    dot: "bg-emerald-500",
    hint: "Every element rests on accepted facts anchored in primary evidence",
  },
};

export const SUPPORT_META: Record<SupportStatus, { label: string; pill: string }> = {
  no_support: { label: "No support", pill: "bg-rose-50 text-rose-700 ring-rose-200" },
  weak_support: { label: "Weak support", pill: "bg-orange-50 text-orange-700 ring-orange-200" },
  moderate_support: { label: "Moderate support", pill: "bg-sky-50 text-sky-700 ring-sky-200" },
  strong_support: { label: "Strong support", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  conflicted: { label: "Conflicted", pill: "bg-violet-50 text-violet-700 ring-violet-200" },
  not_researched: { label: "Not researched", pill: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export const SOURCE_STATUS_HINT: Record<string, string> = {
  primary: "primary evidence",
  public_record: "public record",
  testimony: "testimony",
  derived: "derived copy",
  working_note: "working note",
};
