import EvidenceDetailPage from "./evidence-detail-client";

export function generateStaticParams() {
  return [
    { id: "src-230-001" },
    { id: "src-230-016" },
    { id: "src-230-018" },
    { id: "src-230-019" },
    { id: "src-230-022" },
    { id: "src-510-001" },
    { id: "src-510-007" },
    { id: "src-510-015" },
    { id: "src-510-025" },
    { id: "src-nyscef-63" },
  ];
}

export default function Page() {
  return <EvidenceDetailPage />;
}
