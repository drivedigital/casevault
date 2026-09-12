// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.2). New file inside the EU-D write set.

"use client";

import { useState } from "react";
import { secondaryButtonClass } from "@/components/field";
import { describeError } from "@/lib/evidence-detail-errors";
import { downloadOriginalFile } from "@/lib/evidence-detail-files";
import type { Source } from "@/lib/types";

/**
 * Explicit "Download original" (contract §EU-D.2), offered for every source
 * type. Fetch-backed so failures are visible (missing stored file, API down,
 * timeout); the served bytes and filename are preserved by the blob/object
 * URL handoff. A preview or a bare link is never accepted as proof.
 */
export function DownloadOriginalButton({
  source,
  label = "Download original",
  className,
}: {
  source: Source;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<
    { phase: "idle" | "working" } | { phase: "error"; message: string }
  >({ phase: "idle" });

  const onClick = async () => {
    setState({ phase: "working" });
    try {
      await downloadOriginalFile(source);
      setState({ phase: "idle" });
    } catch (err) {
      setState({ phase: "error", message: describeError(err) });
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={state.phase === "working"}
        title={source.original_filename ?? `source ${source.id}`}
        className={className ?? `${secondaryButtonClass} text-xs`}
        data-testid="download-original"
      >
        {state.phase === "working" ? "Downloading…" : label}
      </button>
      {state.phase === "error" ? (
        <p role="alert" className="text-xs text-red-600">
          Download failed — {state.message}. You can retry.
        </p>
      ) : null}
    </div>
  );
}
