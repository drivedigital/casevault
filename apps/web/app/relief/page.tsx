import { ModulePlaceholder } from "@/components/module-placeholder";

export default function Page() {
  return (
    <ModulePlaceholder
      title="Relief"
      summary="Relief matrix tracking each request separately from merits claims: objective, factual support, risk, fallback, and recommendation."
      planned={["Relief categories: damages, injunction, preservation, accounting, inspection, access, leave to sue","Links from relief requests to facts, claims, and authorities","Narrowing/fallback positions and prudence notes"]}
    />
  );
}
