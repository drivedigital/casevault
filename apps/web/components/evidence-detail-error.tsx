// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.4). New file inside the EU-D write set.

import { secondaryButtonClass } from "@/components/field";

/**
 * Distinct, non-leaking error surface with an optional retry action. Used
 * for query failures (source / pages / matters) and failed actions, each
 * with its own title so failures are attributable to the exact operation.
 */
export function ErrorNote({
  title,
  message,
  onRetry,
  retryLabel = "Retry",
  pending = false,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  pending?: boolean;
}) {
  return (
    <div
      role="alert"
      data-testid="error-note"
      className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-red-700">{title}</p>
          <p className="mt-0.5 text-xs text-red-600">{message}</p>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            disabled={pending}
            className={`${secondaryButtonClass} px-2 py-1 text-xs`}
          >
            {pending ? "Retrying…" : retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Amber note for degraded-but-usable states (stale data, timeout, skipped). */
export function WarningNote({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      data-testid="warning-note"
      className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
    >
      <p className="font-medium">{title}</p>
      {children ? <div className="mt-0.5 text-xs">{children}</div> : null}
    </div>
  );
}
