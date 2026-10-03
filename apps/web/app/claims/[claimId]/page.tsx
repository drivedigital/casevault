import ClaimChartPage from "./claim-chart-client";

export function generateStaticParams() {
  return [
    { claimId: "cl-c1" },
    { claimId: "cl-c2" },
    { claimId: "cl-g2" },
    { claimId: "cl-510-crl51" },
    { claimId: "cl-510-h1" },
  ];
}

export default function Page() {
  return <ClaimChartPage />;
}
