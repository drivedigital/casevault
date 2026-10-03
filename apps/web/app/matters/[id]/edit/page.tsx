import EditMatter from "./matter-edit-client";

export function generateStaticParams() {
  return [
    { id: "m-001" },
    { id: "m-002" },
    { id: "m-003" },
  ];
}

export default function Page() {
  return <EditMatter />;
}
