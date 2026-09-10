"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { Badge, statusColor, typeColor } from "@/components/badge";
import { ACTOR_ROLE_LABELS, MATTER_LINK_TYPES } from "@/lib/types";
import { buttonClass, inputClass } from "@/components/field";

export default function MatterDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const matter = useQuery({ queryKey: ["matter", id], queryFn: () => api.getMatter(id) });
  const links = useQuery({ queryKey: ["matter-links", id], queryFn: () => api.listLinks(id) });
  const matterActors = useQuery({
    queryKey: ["matter-actors", id],
    queryFn: () => api.listMatterActors(id),
  });
  const allMatters = useQuery({ queryKey: ["matters"], queryFn: () => api.listMatters() });
  const allActors = useQuery({ queryKey: ["actors"], queryFn: () => api.listActors() });
  const sourceLinks = useQuery({
    queryKey: ["matter-sources", id],
    queryFn: () => api.listMatterSourceLinks(id),
  });
  const allSources = useQuery({ queryKey: ["sources"], queryFn: () => api.listSources() });

  const [linkTarget, setLinkTarget] = useState("");
  const [linkType, setLinkType] = useState<string>(MATTER_LINK_TYPES[0]);
  const [linkNotes, setLinkNotes] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  const [actorId, setActorId] = useState("");
  const [roleLabel, setRoleLabel] = useState<string>(ACTOR_ROLE_LABELS[0]);
  const [roleNotes, setRoleNotes] = useState("");
  const [roleError, setRoleError] = useState<string | null>(null);

  const [sourceTarget, setSourceTarget] = useState("");
  const [sourceError, setSourceError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["matter-links", id] });
    qc.invalidateQueries({ queryKey: ["matter-actors", id] });
    qc.invalidateQueries({ queryKey: ["matter-sources", id] });
  };

  const addLink = useMutation({
    mutationFn: () => api.createLink(id, linkTarget, linkType, linkNotes || undefined),
    onSuccess: () => {
      setLinkTarget("");
      setLinkNotes("");
      setLinkError(null);
      invalidate();
    },
    onError: (e) => setLinkError(e instanceof ApiError ? e.message : "Failed to add link."),
  });
  const removeLink = useMutation({ mutationFn: api.deleteLink, onSuccess: invalidate });
  const addRole = useMutation({
    mutationFn: () => api.assignRole(id, actorId, roleLabel, roleNotes || undefined),
    onSuccess: () => {
      setActorId("");
      setRoleNotes("");
      setRoleError(null);
      invalidate();
    },
    onError: (e) => setRoleError(e instanceof ApiError ? e.message : "Failed to assign role."),
  });
  const removeRole = useMutation({ mutationFn: api.deleteRole, onSuccess: invalidate });
  const attachSource = useMutation({
    mutationFn: () => api.linkSourceToMatter(id, sourceTarget),
    onSuccess: () => {
      setSourceTarget("");
      setSourceError(null);
      invalidate();
    },
    onError: (e) =>
      setSourceError(e instanceof ApiError ? e.message : "Failed to link source."),
  });
  const removeSourceLink = useMutation({
    mutationFn: api.deleteSourceMatterLink,
    onSuccess: invalidate,
  });

  if (matter.isLoading) return <p className="text-sm text-slate-500">Loading matter…</p>;
  if (matter.isError) return <p className="text-sm text-red-600">Matter not found.</p>;
  const m = matter.data!;

  const otherMatters = (allMatters.data ?? []).filter((x) => x.id !== m.id);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-1 text-xs text-slate-400">
        <Link href="/matters" className="hover:underline">Matters</Link> / {m.slug}
      </div>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{m.name}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge label={m.matter_type} color={typeColor[m.matter_type]} />
            <Badge label={m.status} color={statusColor[m.status]} />
            <Badge label={m.jurisdiction} color="blue" />
            <Badge label={`AI: ${m.ai_sharing_policy}`} color="green" />
          </div>
        </div>
        <Link
          href={`/matters/${m.id}/edit`}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </Link>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            Theory summary
          </h2>
          <p className="text-sm leading-6 text-slate-700">{m.theory_summary ?? "—"}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            Next work
          </h2>
          <p className="text-sm leading-6 text-slate-700">{m.next_work ?? "—"}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- linked matters ---- */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-900">
            Linked matters &amp; proceedings ({links.data?.length ?? 0})
          </div>
          <div className="divide-y divide-slate-100">
            {(links.data ?? []).map((link) => (
              <div key={link.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <Badge label={link.link_type} color="violet" />{" "}
                  <span className="text-slate-500">{link.direction === "outgoing" ? "→" : "←"}</span>{" "}
                  <Link
                    href={`/matters/${link.direction === "outgoing" ? link.to_matter_id : link.from_matter_id}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {link.direction === "outgoing" ? link.to_matter_name : link.from_matter_name}
                  </Link>
                  {link.notes ? <div className="mt-0.5 text-xs text-slate-400">{link.notes}</div> : null}
                </div>
                <button
                  onClick={() => removeLink.mutate(link.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  remove
                </button>
              </div>
            ))}
            {(links.data ?? []).length === 0 && (
              <p className="px-4 py-4 text-sm text-slate-500">
                No links yet. Overlay proceedings and shared-actor relationships appear here.
              </p>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (linkTarget) addLink.mutate();
            }}
            className="space-y-2 border-t border-slate-200 px-4 py-3"
          >
            <div className="flex gap-2">
              <select className={inputClass} value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)}>
                <option value="">Relate to matter…</option>
                {otherMatters.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
              </select>
              <select className={inputClass} value={linkType} onChange={(e) => setLinkType(e.target.value)}>
                {MATTER_LINK_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Notes (optional)"
                value={linkNotes}
                onChange={(e) => setLinkNotes(e.target.value)}
              />
              <button type="submit" className={buttonClass} disabled={!linkTarget || addLink.isPending}>
                Link
              </button>
            </div>
            {linkError ? <p className="text-xs text-red-600">{linkError}</p> : null}
          </form>
        </section>

        {/* ---- actors ---- */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-900">
            Actors &amp; roles ({matterActors.data?.length ?? 0})
          </div>
          <div className="divide-y divide-slate-100">
            {(matterActors.data ?? []).map((r) => (
              <div key={r.role_id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <Link href={`/actors/${r.actor_id}`} className="font-medium text-blue-700 hover:underline">
                    {r.actor_name}
                  </Link>{" "}
                  <Badge label={r.role_label} color="amber" />
                  {r.notes ? <div className="mt-0.5 text-xs text-slate-400">{r.notes}</div> : null}
                </div>
                <button
                  onClick={() => removeRole.mutate(r.role_id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  remove
                </button>
              </div>
            ))}
            {(matterActors.data ?? []).length === 0 && (
              <p className="px-4 py-4 text-sm text-slate-500">
                No actors assigned. Register actors under{" "}
                <Link href="/actors" className="text-blue-700 underline">Actors</Link>, then assign roles.
              </p>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (actorId) addRole.mutate();
            }}
            className="space-y-2 border-t border-slate-200 px-4 py-3"
          >
            <div className="flex gap-2">
              <select className={inputClass} value={actorId} onChange={(e) => setActorId(e.target.value)}>
                <option value="">Select actor…</option>
                {(allActors.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.display_name}</option>
                ))}
              </select>
              <select className={inputClass} value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)}>
                {ACTOR_ROLE_LABELS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Notes (optional)"
                value={roleNotes}
                onChange={(e) => setRoleNotes(e.target.value)}
              />
              <button type="submit" className={buttonClass} disabled={!actorId || addRole.isPending}>
                Assign
              </button>
            </div>
            {roleError ? <p className="text-xs text-red-600">{roleError}</p> : null}
          </form>
        </section>

        {/* ---- evidence sources ---- */}
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-900">
            Evidence sources ({sourceLinks.data?.length ?? 0})
          </div>
          <div className="divide-y divide-slate-100">
            {(sourceLinks.data ?? []).map((link) => (
              <div key={link.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <Link href={`/evidence/${link.source_id}`} className="font-medium text-blue-700 hover:underline">
                    {link.source_title}
                  </Link>
                  {link.link_reason ? (
                    <div className="mt-0.5 text-xs text-slate-400">{link.link_reason}</div>
                  ) : null}
                </div>
                <button
                  onClick={() => removeSourceLink.mutate(link.id)}
                  className="text-xs text-slate-400 hover:text-red-600"
                >
                  unlink
                </button>
              </div>
            ))}
            {(sourceLinks.data ?? []).length === 0 && (
              <p className="px-4 py-4 text-sm text-slate-500">
                No evidence linked. Upload sources under{" "}
                <Link href="/evidence" className="text-blue-700 underline">Evidence</Link>, then link them here.
              </p>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (sourceTarget) attachSource.mutate();
            }}
            className="space-y-2 border-t border-slate-200 px-4 py-3"
          >
            <div className="flex gap-2">
              <select className={inputClass} value={sourceTarget} onChange={(e) => setSourceTarget(e.target.value)}>
                <option value="">Link evidence source…</option>
                {(allSources.data ?? []).map((src) => (
                  <option key={src.id} value={src.id}>{src.title} ({src.source_type})</option>
                ))}
              </select>
              <button type="submit" className={buttonClass} disabled={!sourceTarget || attachSource.isPending}>
                Link
              </button>
            </div>
            {sourceError ? <p className="text-xs text-red-600">{sourceError}</p> : null}
          </form>
        </section>
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Created {new Date(m.created_at).toLocaleString()} · Updated {new Date(m.updated_at).toLocaleString()}
        {m.archived_at ? ` · Archived ${new Date(m.archived_at).toLocaleString()}` : ""}
      </p>
    </div>
  );
}
