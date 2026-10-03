import EvidenceDetailPage from "./evidence-detail-client";

export function generateStaticParams() {
  return [
    { id: "src-001" },
    { id: "src-002" },
    { id: "src-003" },
  ];
}

export default function Page() {
  return <EvidenceDetailPage />;
}
