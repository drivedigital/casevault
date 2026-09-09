"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Badge } from "@/components/badge";
import { buttonClass, inputClass } from "@/components/field";

export default function ActorDossier() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const dossier = useQuery({ queryKey: ["actor", id], queryFn: () => api.getActor(id) });

  const [aliasText, setAliasText] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["actor", id] });
    qc.invalidateQueries({ queryKey: ["actors"] });
  };

  const addAlias = useMutation({
    mutationFn: () => api.addAlias(id, aliasText),
    onSuccess: () => {
      setAliasText("");
      setAliasError(null);
      invalidate();
    },
    onError: (e) => setAliasError(e instanceof ApiError ? e.message : "Failed to add alias."),
  });
  const removeAlias = useMutation({ mutationFn: api.deleteAlias, onSuccess: invalidate });
  const save = useMutation({
    mutationFn: () =>
      api.updateActor(id, {
        display_name: editName,
        description: editDesc || null,
      }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
  });

  if (dossier.isLoading) return <p className="text-sm text-slate-500">Loading actor…</p>;
  if (dossier.isError) return <p className="text-sm text-red-600">Actor not found.</p>;
  const { actor, roles } = dossier.data!;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-1 text-xs text-slate-400">
        <Link href="/actors" className="hover:underline">Actors</Link> / {actor.normalized_name}
      </div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{actor.display_name}</h1>
          <div className="mt-2 flex gap-1.5">
            <Badge label={actor.actor_type} color="blue" />
            <Badge label={`${roles.length} matter role${roles.length === 1 ? "" : "s"}`} color="slate" />
          </div>
        </div>
        <button
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => {
            setEditName(actor.display_name);
            setEditDesc(actor.description ?? "");
            setEditing(!editing);
          }}
        >
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {editing ? (
        <div className="mb-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <input className={inputClass} value={editName} onChange={(e) => setEditName(e.target.value)} />
          <textarea
            className={inputClass}
            rows={3}
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="Description"
          />
          <button className={buttonClass} onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      ) : (
        actor.description && (
          <p className="mb-4 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
            {actor.description}
          </p>
        )
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-900">
            Aliases ({actor.aliases.length})
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 py-3">
            {actor.aliases.map((al) => (
              <span
                key={al.id}
                className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-700"
              >
                {al.alias_text}
                <button
                  className="text-slate-400 hover:text-red-600"
                  onClick={() => removeAlias.mutate(al.id)}
                  aria-label={`Remove alias ${al.alias_text}`}
                >
                  ×
                </button>
              </span>
            ))}
            {actor.aliases.length === 0 && <p className="text-sm text-slate-500">No aliases.</p>}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (aliasText.trim()) addAlias.mutate();
            }}
            className="flex gap-2 border-t border-slate-200 px-4 py-3"
          >
            <input
              className={inputClass}
              placeholder="Add alias…"
              value={aliasText}
              onChange={(e) => setAliasText(e.target.value)}
            />
            <button type="submit" className={buttonClass} disabled={!aliasText.trim()}>
              Add
            </button>
          </form>
          {aliasError ? <p className="px-4 pb-3 text-xs text-red-600">{aliasError}</p> : null}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-900">
            Matter roles ({roles.length})
          </div>
          <div className="divide-y divide-slate-100">
            {roles.map((r) => (
              <div key={r.role_id} className="px-4 py-2.5 text-sm">
                <Link href={`/matters/${r.matter_id}`} className="font-medium text-blue-700 hover:underline">
                  {r.matter_name}
                </Link>{" "}
                <Badge label={r.role_label} color="amber" />
                {r.notes ? <div className="mt-0.5 text-xs text-slate-400">{r.notes}</div> : null}
              </div>
            ))}
            {roles.length === 0 && (
              <p className="px-4 py-4 text-sm text-slate-500">
                Not assigned to any matter yet — assign roles from a matter page.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
