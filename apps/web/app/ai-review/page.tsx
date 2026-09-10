"use client";

/**
 * WS-I (/ai-review) — Screen 6 (proposal review inbox) + Screen 7 facts tab.
 * Contract: docs/contracts/wave2_intake_core.md v1.0 §5.2.
 *
 * Review-state floor (contract §4.1) — the visible half:
 *   - accepting a proposal creates a fact in `proposed`, never `accepted`;
 *   - the ONLY Approve affordance in this app is in the Accepted facts tab and
 *     it calls POST /facts/{id}/approve;
 *   - `proposed` (and every other non-`accepted` state) renders with a distinct
 *     badge plus "Not yet trusted" copy.
 */
import { useState } from "react";
import { ReviewFactsTable } from "@/components/review-facts-table";
import { ReviewInbox } from "@/components/review-inbox";

type Tab = "inbox" | "facts";

export default function AiReviewPage() {
  const [tab, setTab] = useState<Tab>("inbox");

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900">AI review</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review proposals before they touch the trusted record: raw source → reviewed proposal →
          proposed fact → explicitly approved fact.
        </p>
      </header>

      <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-medium">Nothing on this screen is trusted until it is approved.</p>
        <p className="mt-1">
          Accepting a proposal creates a fact with review state{" "}
          <span className="font-mono">proposed</span>. Only{" "}
          <span className="font-mono">POST /facts/{"{id}"}/approve</span> produces{" "}
          <span className="font-mono">accepted</span> — the set{" "}
          <span className="font-mono">GET /facts?review_state=accepted</span> returns to chronology
          and claims.{" "}
          <span className="font-mono">proposed</span> and{" "}
          <span className="font-mono">accepted_with_edits</span> facts are shown, but marked as not
          trusted.
        </p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-slate-200" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "inbox"}
          onClick={() => setTab("inbox")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "inbox"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Inbox
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "facts"}
          onClick={() => setTab("facts")}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
            tab === "facts"
              ? "border-slate-900 text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Accepted facts
        </button>
      </div>

      {tab === "inbox" ? <ReviewInbox /> : <ReviewFactsTable />}
    </div>
  );
}
