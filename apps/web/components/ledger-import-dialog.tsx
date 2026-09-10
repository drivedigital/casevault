"use client";

import { useState } from "react";
import { ApiError, importLedger } from "@/lib/api";
import type { LedgerImportResult } from "@/lib/types";
import { buttonClass, secondaryButtonClass } from "@/components/field";

function messageFor(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

export function LedgerImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (result: LedgerImportResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<LedgerImportResult | null>(null);
  const [result, setResult] = useState<LedgerImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const close = () => {
    if (previewing || importing) return;
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    onClose();
  };

  const previewFile = async () => {
    if (!file) {
      setError("Choose a CSV file before previewing it.");
      return;
    }
    setPreviewing(true);
    setError(null);
    setResult(null);
    try {
      const imported = await importLedger(file, true);
      setPreview(imported);
    } catch (caught) {
      setPreview(null);
      setError(messageFor(caught, "Could not validate this CSV."));
    } finally {
      setPreviewing(false);
    }
  };

  const confirmImport = async () => {
    if (!file || !preview) return;
    setImporting(true);
    setError(null);
    try {
      const imported = await importLedger(file, false);
      setResult(imported);
      onImported(imported);
    } catch (caught) {
      setError(messageFor(caught, "Could not import this CSV."));
    } finally {
      setImporting(false);
    }
  };

  const report = result ?? preview;
  const phase = result ? "Import result" : "Dry-run preview";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="ledger-import-title">
      <button type="button" className="absolute inset-0 bg-slate-900/30" aria-label="Close CSV import" onClick={close} />
      <section className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 id="ledger-import-title" className="text-lg font-semibold text-slate-900">Import source ledger CSV</h2>
            <p className="mt-1 text-sm text-slate-600">Preview validation first. Nothing is written until you confirm the import.</p>
          </div>
          <button type="button" className="rounded p-2 text-slate-500 hover:bg-slate-100" onClick={close} aria-label="Close">×</button>
        </div>

        <label className="block rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
          <span className="mb-2 block font-medium">CSV file</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setResult(null);
              setError(null);
            }}
          />
          {file ? <span className="mt-2 block text-xs text-slate-500">{file.name}</span> : null}
        </label>

        <div className="mt-4 flex justify-end">
          <button type="button" className={buttonClass} disabled={!file || previewing || importing} onClick={previewFile}>
            {previewing ? "Validating…" : "Preview CSV"}
          </button>
        </div>

        {error ? <p role="alert" className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        {report ? (
          <div className="mt-5 rounded-lg border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">{phase}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {report.valid} valid · {report.created} {result ? "created" : "would be created"} · {report.skipped} skipped
              </p>
            </div>
            {report.errors.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs text-slate-500">
                    <tr><th className="px-4 py-2 font-medium">Row</th><th className="px-4 py-2 font-medium">Validation error</th></tr>
                  </thead>
                  <tbody>
                    {report.errors.map((rowError, index) => (
                      <tr key={`${rowError.row}-${index}`} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 font-mono text-xs text-slate-600">{rowError.row}</td>
                        <td className="px-4 py-2 text-red-700">{rowError.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-4 py-3 text-sm text-green-700">No row-level errors found.</p>}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={close} disabled={previewing || importing}>
            {result ? "Done" : "Cancel"}
          </button>
          {!result ? (
            <button
              type="button"
              className={buttonClass}
              disabled={!preview || preview.valid === 0 || previewing || importing}
              onClick={confirmImport}
            >
              {importing ? "Importing…" : `Confirm import${preview ? ` (${preview.valid} valid)` : ""}`}
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
