import { Badge } from "./badge";

export const reviewStatusColor: Record<string, "green" | "blue" | "amber" | "red" | "slate" | "violet"> = {
  uploaded: "blue",
  processing: "amber",
  reviewed: "violet",
  cited: "green",
  included: "green",
  excluded: "red",
  duplicate: "amber",
  privileged: "slate",
  settlement_restricted: "slate",
  background_only: "slate",
  impeachment_only: "slate",
};

export const sourceStatusColor: Record<string, "blue" | "violet" | "amber" | "green" | "slate"> = {
  primary: "green",
  derived: "blue",
  testimony: "violet",
  working_note: "amber",
  public_record: "slate",
};

export function SourceReviewBadge({ status }: { status: string }) {
  return <Badge label={status} color={reviewStatusColor[status] ?? "slate"} />;
}

export function SourceStatusBadge({ status }: { status: string }) {
  return <Badge label={status} color={sourceStatusColor[status] ?? "slate"} />;
}
