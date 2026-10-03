import MatterDetail from "./matter-detail-client";

export function generateStaticParams() {
  return [
    { id: "m-230cps" },
    { id: "m-510w42" },
    { id: "m-part19" },
    { id: "230cps" },
    { id: "510w42" },
    { id: "part19" },
  ];
}

export default function Page() {
  return <MatterDetail />;
}
