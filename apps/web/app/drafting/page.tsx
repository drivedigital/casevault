import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Drafting Studio"
      summary="Draft sections generated only from approved facts and linked authorities, with a per-paragraph support inspector."
      planned={["Chronology narratives, statements of facts, claim and relief sections","Support chain display per draft paragraph","Warnings for sentences lacking an approved source-backed basis"]}
    />
  );
}
