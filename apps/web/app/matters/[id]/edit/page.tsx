"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { buttonClass, Field, inputClass, secondaryButtonClass } from "@/components/field";

const TYPES = ["merits", "proceeding", "research", "other"];
const STATUSES = ["active", "planned", "hold", "archived"];

export default function EditMatter() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const matter = useQuery({ queryKey: ["matter", id], queryFn: () => api.getMatter(id) });

  const [form, setForm] = useState({
    name: "",
    slug: "",
    matter_type: "merits",
    status: "active",
    theory_summary: "",
    next_work: "",
    jurisdiction: "NY",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (matter.data) {
      setForm({
        name: matter.data.name,
        slug: matter.data.slug,
        matter_type: matter.data.matter_type,
        status: matter.data.status,
        theory_summary: matter.data.theory_summary ?? "",
        next_work: matter.data.next_work ?? "",
        jurisdiction: matter.data.jurisdiction,
      });
    }
  }, [matter.data]);

  const mutation = useMutation({
    mutationFn: () =>
      api.updateMatter(id, {
        name: form.name,
        slug: form.slug,
        matter_type: form.matter_type as never,
        status: form.status as never,
        theory_summary: form.theory_summary || null,
        next_work: form.next_work || null,
        jurisdiction: form.jurisdiction,
      }),
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: ["matter", id] });
      qc.invalidateQueries({ queryKey: ["matters"] });
      router.push(`/matters/${m.id}`);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed to save."),
  });

  if (matter.isLoading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Edit matter</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutation.mutate();
        }}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      >
        <Field label="Name">
          <input className={inputClass} value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Slug" hint="Unique within the workspace; lowercase.">
          <input className={inputClass} value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Type">
            <select className={inputClass} value={form.matter_type}
              onChange={(e) => setForm({ ...form, matter_type: e.target.value })}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Status" hint="'archived' records the archive timestamp.">
            <select className={inputClass} value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Jurisdiction">
          <input className={inputClass} value={form.jurisdiction}
            onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })} />
        </Field>
        <Field label="Theory summary">
          <textarea className={inputClass} rows={3} value={form.theory_summary}
            onChange={(e) => setForm({ ...form, theory_summary: e.target.value })} />
        </Field>
        <Field label="Next work">
          <textarea className={inputClass} rows={2} value={form.next_work}
            onChange={(e) => setForm({ ...form, next_work: e.target.value })} />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <button type="submit" className={buttonClass} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save changes"}
          </button>
          <Link href={`/matters/${id}`} className={secondaryButtonClass}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}
