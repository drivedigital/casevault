"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { claimsApi, type ClaimTemplate } from "@/lib/api";

export default function NewClaimDialog({
  matterId,
  onClose,
}: {
  matterId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: templates = [] } = useQuery({
    queryKey: ["claim-templates"],
    queryFn: () => claimsApi.listTemplates("NY"),
  });
  const [templateId, setTemplateId] = useState<string>("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [target, setTarget] = useState("");
  const [theory, setTheory] = useState("");

  const selected: ClaimTemplate | undefined = templates.find((t) => t.id === templateId);

  const create = useMutation({
    mutationFn: () =>
      claimsApi.createClaim({
        matter_id: matterId,
        template_id: templateId || null,
        name: name.trim() || selected?.name || "Untitled claim",
        claim_code: code.trim() || null,
        target_summary: target.trim() || null,
        theory_summary: theory.trim() || null,
        status: "working",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["claims"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-slate-900">New claim in chart</h2>
        <p className="mt-1 text-xs text-slate-500">
          Start from a NY template — its elements become the burden-of-proof checklist.
        </p>

        <div className="mt-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Template</span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value);
                const t = templates.find((x) => x.id === e.target.value);
                if (t && !name) setName(t.name);
              }}
            >
              <option value="">Blank claim (no template)</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.jurisdiction} · {t.name} ({t.element_count} elements)
                </option>
              ))}
            </select>
          </label>
          {selected ? (
            <ul className="list-disc rounded-lg bg-slate-50 p-3 pl-7 text-xs text-slate-600">
              {selected.elements.map((el) => (
                <li key={el.id}>
                  {el.element_order}. {el.element_label}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 block">
              <span className="text-xs font-semibold text-slate-600">Claim name</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={name}
                placeholder={selected?.name ?? "e.g. Breach of Contract — nonpayment"}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Code</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                value={code}
                placeholder="C4"
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Targets (defendants)</span>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={target}
              placeholder="Northline Logistics, Inc. (primary defendant)"
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">Theory summary</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={2}
              value={theory}
              onChange={(e) => setTheory(e.target.value)}
            />
          </label>
          {create.isError ? (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
              {(create.error as Error).message}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            disabled={create.isPending || (!templateId && !name.trim())}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Charting…" : "Add claim"}
          </button>
        </div>
      </div>
    </div>
  );
}
