import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Matters"
      summary="Master workspace with multiple linked matters and overlay proceedings (e.g., leave/preservation proceedings) that affect several matters at once."
      planned={["Matter create/edit/archive with status, theory summary, and next work","Overlay proceeding creation linked to multiple merits matters","Dashboard surfacing open tasks, uploads, gaps, and agent activity"]}
    />
  );
}
