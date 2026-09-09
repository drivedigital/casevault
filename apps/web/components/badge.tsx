const COLORS: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  slate: "bg-slate-200 text-slate-700",
  violet: "bg-violet-100 text-violet-800",
};

export function Badge({
  label,
  color = "slate",
}: {
  label: string;
  color?: keyof typeof COLORS;
}) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${COLORS[color]}`}>
      {label}
    </span>
  );
}

export const statusColor: Record<string, keyof typeof COLORS> = {
  active: "green",
  planned: "blue",
  hold: "amber",
  archived: "slate",
};

export const typeColor: Record<string, keyof typeof COLORS> = {
  merits: "blue",
  proceeding: "violet",
  research: "amber",
  other: "slate",
};
