"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Badge } from "@/components/badge";
import { buttonClass, Field, inputClass } from "@/components/field";

const TYPES = ["person", "entity", "court", "agency", "other"] as const;

export default function ActorsIndex() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [actorType, setActorType] = useState<(typeof TYPES)[number]>("person");
  const [aliases, setAliases] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const actors = useQuery({
    queryKey: ["actors", q],
    queryFn: () => api.listActors(q || undefined),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createActor({
        display_name: name,
        actor_type: actorType,
        description: description || undefined,
        aliases: aliases.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      setName("");
      setAliases("");
      setDescription("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["actors"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to create actor."),
  });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Actor registry</h1>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <input
            className={`${inputClass} mb-3`}
            placeholder="Search by name or alias…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="rounded-lg border border-slate-200 bg-white">
            {(actors.data ?? []).length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">
                No actors yet. Register people and entities on the right — one registry spans
                all matters, so an actor never needs to be entered twice.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Type</th>
                    <th className="px-4 py-2 font-medium">Aliases</th>
                  </tr>
                </thead>
                <tbody>
                  {(actors.data ?? []).map((a) => (
                    <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <Link href={`/actors/${a.id}`} className="font-medium text-blue-700 hover:underline">
                          {a.display_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2"><Badge label={a.actor_type} color="blue" /></td>
                      <td className="px-4 py-2">
                        <span className="space-x-1">
                          {a.aliases.map((al) => (
                            <Badge key={al.id} label={al.alias_text} color="slate" />
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
          className="space-y-3 self-start rounded-lg border border-slate-200 bg-white p-4"
        >
          <h2 className="text-sm font-medium text-slate-900">Register actor</h2>
          <Field label="Display name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Type">
            <select className={inputClass} value={actorType}
              onChange={(e) => setActorType(e.target.value as (typeof TYPES)[number])}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Aliases" hint="Comma-separated: nicknames, initials, variant spellings.">
            <input className={inputClass} value={aliases} onChange={(e) => setAliases(e.target.value)}
              placeholder="DG, D. Grove" />
          </Field>
          <Field label="Description">
            <textarea className={inputClass} rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)} />
          </Field>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <button type="submit" className={buttonClass} disabled={create.isPending || !name.trim()}>
            {create.isPending ? "Saving…" : "Add actor"}
          </button>
        </form>
      </div>
    </div>
  );
}
