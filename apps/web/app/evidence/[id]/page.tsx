"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SourceReviewBadge, SourceStatusBadge } from "@/components/source-badge";
import { Field, inputClass, buttonClass, secondaryButtonClass } from "@/components/field";

export default function EvidenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";
  const [tab, setTab] = useState<"metadata" | "ocr" | "matters" | "status">("metadata");
  const [linkMatterId, setLinkMatterId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editStatus, setEditStatus] = useState("");

  const source = useQuery({ queryKey: ["source", id], queryFn: () => api.getSource(id), enabled: !!id });
  const pages = useQuery({ queryKey: ["pages", id], queryFn: () => api.listSourcePages(id), enabled: !!id });
  const matters = useQuery({ queryKey: ["source-matters", id], queryFn: () => api.listSourceMatters(id), enabled: !!id });
  const allMatters = useQuery({ queryKey: ["matters"], queryFn: () => api.listMatters() });

  const update = useMutation({
    mutationFn: (payload: Partial<Parameters<typeof api.updateSource>[1]>) => api.updateSource(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source", id] }),
  });

  const link = useMutation({
    mutationFn: (matterId: string) => api.linkSourceToMatter(matterId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-matters", id] }),
  });

  const reprocess = useMutation({
    mutationFn: () => api.reprocessSource(id, ["ocr"]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source", id] }),
  });

  const unlink = useMutation({
    mutationFn: (linkId: string) => api.deleteSourceMatterLink(linkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["source-matters", id] }),
  });

  const s = source.data;
  const pageList = pages.data ?? [];
  const matterLinks = matters.data ?? [];

  if (!id) return <div className="p-6 text-red-600">Invalid source id.</div>;
  if (source.isLoading) return <div className="p-6 text-sm text-slate-500">Loading source…</div>;
  if (source.isError || !s) return <div className="p-6 text-red-600">Failed to load source.</div>;

  const isPdf = s.source_type === "pdf" || (s.mime_type?.includes("pdf") ?? false);
  const isImage = s.source_type === "image" || (s.mime_type?.startsWith("image/") ?? false);
  const isText = s.source_type === "text" || s.source_type === "markdown" || s.source_type === "email" || (s.mime_type?.startsWith("text/") ?? false);
  const hasPages = pageList.length > 0;
  const firstPageText = pageList[0]?.ocr_text ?? "";

  return (
    <div className="mx-auto max-w-6xl">
      <button onClick={() => router.push("/evidence")} className="mb-4 text-sm text-blue-700 hover:underline">← Back to evidence</button>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{s.title || s.original_filename || "Untitled source"}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span>{s.source_type}</span>
            <span>·</span>
            <span>{s.mime_type}</span>
            <span>·</span>
            <span>{(s.file_size_bytes ?? 0).toLocaleString()} bytes</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setEditTitle(s.title ?? ""); setEditStatus(s.source_status); setTab("status"); }} className={`${secondaryButtonClass} text-xs`}>
            Edit
          </button>
        </div>
      </div>

      {s.duplicate_of && (
        <div className="mb-4 rounded bg-amber-100 px-3 py-2 text-sm text-amber-800">
          Duplicate of <Link href="/evidence" className="font-medium underline">{s.duplicate_of.title}</Link>
        </div>
      )}

      {/* Viewer */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Viewer</h2>
        {isPdf ? (
          <iframe src={api.sourceFileUrl(id)} title="Source PDF" className="h-[560px] w-full rounded border" />
        ) : isImage ? (
          <img src={api.sourceFileUrl(id)} alt={s.original_filename ?? ""} className="max-h-[560px] rounded border object-contain" />
        ) : isText || hasPages ? (
          <div className="max-h-[560px] overflow-auto rounded border bg-slate-50 p-3">
            {firstPageText ? (
              <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{firstPageText}</pre>
            ) : (
              <p className="text-sm text-slate-400">No OCR text available for page 1.</p>
            )}
          </div>
        ) : (
          <div className="rounded border bg-slate-50 p-4 text-sm text-slate-400">No viewer available for this file type.</div>
        )}
      </div>

      {/* Inspector tabs */}
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex border-b border-slate-200">
          {[
            { key: "metadata", label: "Metadata" },
            { key: "ocr", label: "OCR" },
            { key: "matters", label: "Matters" },
            { key: "status", label: "Status" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as typeof tab)}
              className={`px-4 py-2.5 text-sm font-medium ${tab === t.key ? "border-b-2 border-blue-600 text-blue-700" : "text-slate-500 hover:text-slate-800"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "metadata" && (
            <div className="grid gap-2 text-sm md:grid-cols-2">
              <Field label="Title"><div className="rounded border border-slate-300 bg-white px-3 py-2">{s.title || "—"}</div></Field>
              <Field label="Filename"><div className="rounded border border-slate-300 bg-white px-3 py-2">{s.original_filename || "—"}</div></Field>
              <Field label="Mime type"><div className="rounded border border-slate-300 bg-white px-3 py-2">{s.mime_type || "—"}</div></Field>
              <Field label="Storage path"><div className="rounded border border-slate-300 bg-white px-3 py-2 break-all text-xs">{s.storage_path}</div></Field>
              <Field label="SHA-256"><div className="rounded border border-slate-300 bg-white px-3 py-2 break-all text-xs">{s.sha256 || "—"}</div></Field>
              <Field label="Page count"><div className="rounded border border-slate-300 bg-white px-3 py-2">{s.page_count ?? "—"}</div></Field>
              <Field label="Source status"><div className="rounded border border-slate-300 bg-white px-3 py-2"><SourceStatusBadge status={s.source_status} /></div></Field>
              <Field label="Review status"><div className="rounded border border-slate-300 bg-white px-3 py-2"><SourceReviewBadge status={s.evidence_review_status} /></div></Field>
              <Field label="Included"><div className="rounded border border-slate-300 bg-white px-3 py-2">{s.included_flag ? "Yes" : "No"}</div></Field>
              <Field label="Excluded"><div className="rounded border border-slate-300 bg-white px-3 py-2">{s.excluded_flag ? "Yes" : "No"}</div></Field>
              <Field label="Created"><div className="rounded border border-slate-300 bg-white px-3 py-2">{new Date(s.created_at).toLocaleString()}</div></Field>
              <Field label="Updated"><div className="rounded border border-slate-300 bg-white px-3 py-2">{new Date(s.updated_at).toLocaleString()}</div></Field>
            </div>
          )}

          {tab === "ocr" && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-800">Pages with OCR text</h3>
              {pageList.length === 0 ? (
                <p className="text-sm text-slate-400">No pages extracted.</p>
              ) : (
                <div className="space-y-2">
                  {pageList.map((p) => (
                    <div key={p.id} className="rounded border border-slate-100 bg-slate-50 p-2">
                      <div className="mb-1 text-xs text-slate-500">Page {p.page_number} {p.page_label ? `(${p.page_label})` : ""}</div>
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed text-slate-800">{p.ocr_text ?? "(no text)"}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "matters" && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-800">Linked matters</h3>
              {matterLinks.length === 0 ? (
                <p className="text-sm text-slate-400">Not linked to any matter.</p>
              ) : (
                <div className="space-y-2">
                  {matterLinks.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                      <Link href={`/matters/${m.matter_id}`} className="font-medium text-blue-700 hover:underline">{m.matter_name}</Link>
                      <button onClick={() => unlink.mutate(m.id)} disabled={unlink.isPending} className={`${secondaryButtonClass} text-xs px-2 py-0.5`}>Unlink</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Link to matter">
                    <select className={inputClass} value={linkMatterId} onChange={(e) => setLinkMatterId(e.target.value)}>
                      <option value="">Choose matter</option>
                      {(allMatters.data ?? []).map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <button onClick={() => { if (linkMatterId) link.mutate(linkMatterId); }} disabled={!linkMatterId || link.isPending} className={`${buttonClass} text-xs`}>
                  Link
                </button>
              </div>
            </div>
          )}

          {tab === "status" && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-800">Update fields</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Title">
                  <input className={inputClass} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </Field>
                <Field label="Source status">
                  <select className={inputClass} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                    {["primary", "derived", "testimony", "working_note", "public_record"].map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => update.mutate({ title: editTitle, source_status: editStatus as any })} className={`${buttonClass} text-xs`}>Save</button>
                <button onClick={() => reprocess.mutate()} disabled={reprocess.isPending} className={`${secondaryButtonClass} text-xs`}>
                  {reprocess.isPending ? "Queueing…" : "Reprocess OCR"}
                </button>
                {s.included_flag ? (
                  <button onClick={() => update.mutate({ included_flag: false })} className={`${secondaryButtonClass} text-xs`}>Un-include</button>
                ) : (
                  <button onClick={() => update.mutate({ included_flag: true, excluded_flag: false })} className={`${buttonClass} text-xs bg-green-600 hover:bg-green-700`}>Include</button>
                )}
                {s.excluded_flag ? (
                  <button onClick={() => update.mutate({ excluded_flag: false })} className={`${secondaryButtonClass} text-xs`}>Un-exclude</button>
                ) : (
                  <button onClick={() => update.mutate({ excluded_flag: true, included_flag: false })} className={`${buttonClass} text-xs bg-red-600 hover:bg-red-700`}>Exclude</button>
                )}
              </div>
              {update.isError && <p className="mt-2 text-xs text-red-600">Update failed (check server rules — included and excluded cannot both be true).</p>}
              {reprocess.isSuccess && (
                <p className="mt-2 text-xs text-slate-500">
                  Reprocess request accepted: {reprocess.data.queued ? `queued as job ${reprocess.data.job_id}` : `not queued — ${reprocess.data.reason ?? "worker unavailable"}`}
                </p>
              )}
              {reprocess.isError && <p className="mt-2 text-xs text-red-600">Reprocess request failed.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
