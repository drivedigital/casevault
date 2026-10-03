import ActorDossier from "./actor-dossier-client";

export function generateStaticParams() {
  return [
    { id: "act-01" },
    { id: "act-02" },
    { id: "act-03" },
  ];
}

export default function Page() {
  return <ActorDossier />;
}
