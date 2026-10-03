import MatterDetail from "./matter-detail-client";

export function generateStaticParams() {
  return [
    { id: "m-001" },
    { id: "m-002" },
    { id: "m-003" },
  ];
}

export default function Page() {
  return <MatterDetail />;
}
