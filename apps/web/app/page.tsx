"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge, statusColor, typeColor } from "@/components/badge";

export default function WorkspaceHome() {
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: api.getCurrentWorkspace });
  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api.listMatters() });
  const actors = useQuery({ queryKey: ["actors"], queryFn: () => api.listActors() });

  if (workspace.isLoading) return <p className="text-sm text-slate-500">Loading workspace…</p>;
  if (workspace.isError)
    return (
      <p className="text-sm text-red-600">
        Could not reach the API. Start it with <code>make api</code> and reload.
      </p>
    );

  const all = matters.data ?? [];
  const active = all.filter((m) => m.status === "active");
  const overlays = all.filter((m) => m.matter_type === "proceeding");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{workspace.data?.name}</h1>
          <p className="text-sm text-slate-500">
            Jurisdiction default: {workspace.data?.jurisdiction_default} · AI sharing:{" "}
            {workspace.data?.ai_sharing_default} · local identity mode
          </p>
        </div>
        <Link
          href="/matters/new"
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          + New matter
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total matters", value: all.length, href: "/matters" },
          { label: "Active", value: active.length, href: "/matters?status=active" },
          { label: "Overlay proceedings", value: overlays.length, href: "/matters" },
          { label: "Actors", value: actors.data?.length ?? 0, href: "/actors" },
        ].map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300 hover:shadow-sm"
          >
            <div className="text-2xl font-semibold text-slate-900">{card.value}</div>
            <div className="text-xs text-slate-500">{card.label}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-900">
          Matters
        </div>
        {all.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            No matters yet.{" "}
            <Link href="/matters/new" className="text-blue-700 underline">
              Create your first matter
            </Link>{" "}
            to begin organizing a case file.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Next work</th>
              </tr>
            </thead>
            <tbody>
              {all.slice(0, 8).map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/matters/${m.id}`} className="font-medium text-blue-700 hover:underline">
                      {m.name}
                    </Link>
                    <span className="ml-2 text-xs text-slate-400">{m.slug}</span>
                  </td>
                  <td className="px-4 py-2"><Badge label={m.matter_type} color={typeColor[m.matter_type]} /></td>
                  <td className="px-4 py-2"><Badge label={m.status} color={statusColor[m.status]} /></td>
                  <td className="max-w-xs truncate px-4 py-2 text-slate-500">{m.next_work ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
