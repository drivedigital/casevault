import ActorDossier from "./actor-dossier-client";

export function generateStaticParams() {
  return [
    { id: "act-dg" },
    { id: "act-ir" },
    { id: "act-ac" },
    { id: "act-230coop" },
    { id: "act-ur" },
    { id: "act-mk" },
    { id: "act-dn" },
    { id: "act-ml" },
    { id: "act-jb" },
    { id: "act-nk" },
  ];
}

export default function Page() {
  return <ActorDossier />;
}
