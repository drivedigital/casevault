"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Badge, statusColor, typeColor } from "@/components/badge";

export default function MattersIndex() {
  const [status, setStatus] = useState("");
  const [mtype, setMtype] = useState("");
  const matters = useQuery({
    queryKey: ["matters", status, mtype],
    queryFn: () =>
      api.listMatters({
        ...(status ? { status } : {}),
        ...(mtype ? { matter_type: mtype } : {}),
      }),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Matters</h1>
        <Link
          href="/matters/new"
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          + New matter
        </Link>
      </div>

      <div className="mb-4 flex gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All statuses</option>
          {["active", "planned", "hold", "archived"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={mtype} onChange={(e) => setMtype(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1.5 text-sm">
          <option value="">All types</option>
          {["merits", "proceeding", "research", "other"].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        {matters.isLoading ? (
          <p className="px-4 py-6 text-sm text-slate-500">Loading…</p>
        ) : (matters.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            No matters match. <Link href="/matters/new" className="text-blue-700 underline">Create one</Link>.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Slug</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Jurisdiction</th>
                <th className="px-4 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {(matters.data ?? []).map((m) => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <Link href={`/matters/${m.id}`} className="font-medium text-blue-700 hover:underline">
                      {m.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{m.slug}</td>
                  <td className="px-4 py-2"><Badge label={m.matter_type} color={typeColor[m.matter_type]} /></td>
                  <td className="px-4 py-2"><Badge label={m.status} color={statusColor[m.status]} /></td>
                  <td className="px-4 py-2 text-slate-600">{m.jurisdiction}</td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
