import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Chronology"
      summary="A live chronology built only from reviewed facts and accepted event proposals — table, timeline, swimlane, and printable views."
      planned={["Event creation from approved facts with date precision support","Duplicate/merge detection for near-identical events","Filter by actor, matter, claim theory, significance, source strength"]}
    />
  );
}
