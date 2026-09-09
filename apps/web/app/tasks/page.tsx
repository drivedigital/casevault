import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Tasks"
      summary="Verification, research, evidence follow-up, and claim-gap tasks tied to matters and linked objects."
      planned={["Task queue with priority, status, type, and assignment","Create tasks from element gaps, proposals, or agent findings","Saved views for open verification and proof tasks"]}
    />
  );
}
