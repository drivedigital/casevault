import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Claims"
      summary="Element-by-element claim charts mapping approved facts to causes of action, with visible gaps, conflicts, and authority state."
      planned={["New York-first claim and defense template library","Support status per element with explainable gap detection","Warnings for testimony-only support and unverified authorities"]}
    />
  );
}
