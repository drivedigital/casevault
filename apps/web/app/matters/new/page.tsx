"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { buttonClass, Field, inputClass, secondaryButtonClass } from "@/components/field";

const TYPES = ["merits", "proceeding", "research", "other"] as const;

export default function NewMatter() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [matterType, setMatterType] = useState<(typeof TYPES)[number]>("merits");
  const [theory, setTheory] = useState("");
  const [nextWork, setNextWork] = useState("");
  const [jurisdiction, setJurisdiction] = useState("NY");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.createMatter({
        name,
        matter_type: matterType,
        theory_summary: theory || null,
        next_work: nextWork || null,
        jurisdiction,
      }),
    onSuccess: (matter) => router.push(`/matters/${matter.id}`),
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Failed to create matter."),
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">New matter</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          mutation.mutate();
        }}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5"
      >
        <Field label="Name" hint="A slug is generated automatically; edit it later if needed.">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 230 CPS — 2F Bedroom C"
            required
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Matter type" hint="Use 'proceeding' for overlay proceedings.">
            <select
              className={inputClass}
              value={matterType}
              onChange={(e) => setMatterType(e.target.value as (typeof TYPES)[number])}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Jurisdiction">
            <input
              className={inputClass}
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Theory summary">
          <textarea
            className={inputClass}
            rows={3}
            value={theory}
            onChange={(e) => setTheory(e.target.value)}
          />
        </Field>
        <Field label="Next work">
          <textarea
            className={inputClass}
            rows={2}
            value={nextWork}
            onChange={(e) => setNextWork(e.target.value)}
          />
        </Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex gap-2">
          <button type="submit" className={buttonClass} disabled={mutation.isPending || !name.trim()}>
            {mutation.isPending ? "Creating…" : "Create matter"}
          </button>
          <Link href="/matters" className={secondaryButtonClass}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}
