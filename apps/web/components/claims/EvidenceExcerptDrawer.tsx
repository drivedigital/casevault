"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ElementFact, EvidenceAnchor } from "@/lib/api";
import { SOURCE_STATUS_HINT } from "./statusMeta";

function pageRange(evidence: EvidenceAnchor): string | null {
  const start = evidence.page_start;
  const end = evidence.page_end;
  if (start === null && end === null) return null;
  if (start !== null && end !== null && start !== end) return `pp. ${start}–${end}`;
  return `p. ${start ?? end}`;
}

function locatorLabel(evidence: EvidenceAnchor): string {
  return [pageRange(evidence), evidence.locator_text].filter(Boolean).join(" · ");
}

export default function EvidenceExcerptDrawer({
  fact,
  initialEvidenceIndex,
  onClose,
}: {
  fact: ElementFact;
  initialEvidenceIndex: number;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(initialEvidenceIndex);

  useEffect(() => {
    const lastIndex = Math.max(0, fact.evidence.length - 1);
    setSelectedIndex(Math.min(Math.max(initialEvidenceIndex, 0), lastIndex));
  }, [fact.fact_id, fact.evidence.length, initialEvidenceIndex]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  if (fact.evidence.length === 0) return null;

  const evidence = fact.evidence[selectedIndex] ?? fact.evidence[0];
  const page = pageRange(evidence);
  const locator = locatorLabel(evidence);
  const sourceStatus = SOURCE_STATUS_HINT[evidence.source_status] ?? evidence.source_status.replace(/_/g, " ");

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/35"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-drawer-title"
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">Burden-of-proof evidence</div>
            <h2 id="evidence-drawer-title" className="mt-1 text-lg font-bold text-slate-900">
              Evidence excerpt
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {fact.short_label ?? fact.statement_text}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close evidence excerpt"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Linked fact">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Fact mapped to this claim element</div>
            <p className="mt-1 text-sm font-semibold text-slate-800">{fact.short_label ?? "Fact"}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{fact.statement_text}</p>
          </section>

          {fact.evidence.length > 1 ? (
            <section className="mt-5" aria-label="Evidence sources">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Evidence sources</h3>
                <span className="text-[10px] text-slate-400">{fact.evidence.length} excerpts</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {fact.evidence.map((source, index) => {
                  const selected = index === selectedIndex;
                  const location = locatorLabel(source);
                  return (
                    <button
                      key={`${source.source_id}-${index}`}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedIndex(index)}
                      className={`max-w-full rounded-lg border px-3 py-2 text-left transition ${
                        selected
                          ? "border-sky-400 bg-sky-50 ring-1 ring-sky-200"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <span className="block truncate text-xs font-semibold text-slate-700">{source.title}</span>
                      {location ? <span className="mt-0.5 block truncate text-[10px] text-slate-500">{location}</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="mt-6" aria-labelledby="source-citation-heading">
            <h3 id="source-citation-heading" className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Source citation
            </h3>
            <p className="mt-1 break-words text-sm leading-6 text-slate-800">
              <cite className="not-italic font-semibold">{evidence.title}</cite>
              {locator ? <span className="text-slate-600">, {locator}</span> : null}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
              <span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600">{evidence.source_type}</span>
              <span className="rounded-full bg-emerald-50 px-2 py-1 font-medium text-emerald-700">{sourceStatus}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500">
                review: {evidence.evidence_review_status.replace(/_/g, " ")}
              </span>
              {evidence.is_primary_anchor ? (
                <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">primary anchor</span>
              ) : null}
            </div>
          </section>

          <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50/70 p-4" aria-labelledby="page-locator-heading">
            <h3 id="page-locator-heading" className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Highlighted page locator
            </h3>
            <div className="mt-2 text-sm text-amber-950">
              {page ? (
                <mark className="rounded-md bg-amber-200 px-2 py-1 font-semibold text-amber-950">{page}</mark>
              ) : (
                <span className="rounded-md bg-white/80 px-2 py-1 text-xs text-amber-800 ring-1 ring-amber-200">
                  Page number not recorded
                </span>
              )}
              {evidence.locator_text ? <span className="ml-2 font-medium">{evidence.locator_text}</span> : null}
            </div>
          </section>

          <section className="mt-6" aria-labelledby="excerpt-heading">
            <h3 id="excerpt-heading" className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Excerpt at this locator
            </h3>
            {evidence.excerpt_text ? (
              <blockquote className="mt-2 whitespace-pre-wrap rounded-xl border-l-4 border-sky-400 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                {evidence.excerpt_text}
              </blockquote>
            ) : (
              <p className="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
                No excerpt text is stored for this anchor. Use the source record and page locator to inspect the underlying evidence.
              </p>
            )}
          </section>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
          <span className="text-[10px] text-slate-400">Source ID · {evidence.source_id}</span>
          <Link
            href={`/evidence/${encodeURIComponent(evidence.source_id)}`}
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
          >
            Open source record <span aria-hidden="true">→</span>
          </Link>
        </footer>
      </aside>
    </div>
  );
}
