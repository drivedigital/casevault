import ClaimChartPage from "./claim-chart-client";

export function generateStaticParams() {
  return [
    { claimId: "claim-001" },
    { claimId: "cl-001" },
  ];
}

export default function Page() {
  return <ClaimChartPage />;
}
