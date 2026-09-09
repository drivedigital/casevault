import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Research Library"
      summary="Uploaded statutes, cases, rules, and research notes linked directly to claim elements and procedural issues."
      planned={["Proposition-based notes with pinpoints and treatment risk","Controlling authority vs. background note separation","Unresolved legal-question tracking distinct from factual gaps"]}
    />
  );
}
