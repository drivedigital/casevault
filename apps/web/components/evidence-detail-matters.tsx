// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.4 + §EU-D.6). New file inside the EU-D write set.
//
// Matters tab: linked-matter list + link/unlink actions. Failures of the
// three involved queries (source links, available matters) and of the two
// actions are surfaced distinctly with retry; a failed query never renders
// as a false "not linked to any matter" / "no matters" empty state, and
// stale data from an earlier success is labeled. Retries preserve the
// selected matter; pending actions disable their controls.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { Field, inputClass, buttonClass, secondaryButtonClass } from "@/components/field";
import { ErrorNote, WarningNote } from "@/components/evidence-detail-error";
import { describeError } from "@/lib/evidence-detail-errors";
import type { Matter, SourceMatterLink } from "@/lib/types";

export interface EvidenceMattersPanelProps {
  links: UseQueryResult<SourceMatterLink[], Error>;
  allMatters: UseQueryResult<Matter[], Error>;
  link: UseMutationResult<SourceMatterLink, Error, string>;
  unlink: UseMutationResult<void, Error, { linkId: string; matterId: string }>;
}

export function EvidenceMattersPanel({ links, allMatters, link, unlink }: EvidenceMattersPanelProps) {
  const [linkMatterId, setLinkMatterId] = useState("");

  // Clear the selection only after a successful link; failures keep it so
  // the retry path preserves the entered value.
  useEffect(() => {
    if (link.isSuccess) setLinkMatterId("");
  }, [link.isSuccess, link.data?.id]);

  const onLink = () => {
    if (linkMatterId && !link.isPending) link.mutate(linkMatterId);
  };

  const linksError = links.isError ? describeError(links.error) : null;

  return (
    <div className="space-y-3" data-testid="matters-panel">
      <h3 className="text-sm font-medium text-slate-800">Linked matters</h3>

      {links.isError && !links.data ? (
        <ErrorNote
          title="Couldn't load linked matters"
          message={`${linksError ?? "Unknown error."} This is a load failure, not an empty list.`}
          onRetry={() => void links.refetch()}
          pending={links.isFetching}
        />
      ) : links.isLoading ? (
        <p className="text-sm text-slate-500">Loading linked matters…</p>
      ) : (
        <>
          {links.isError && links.data ? (
            <WarningNote title="Linked-matters refresh failed — showing the last loaded list.">
              <span>
                {linksError}{" "}
                <button
                  type="button"
                  className="font-medium underline"
                  onClick={() => void links.refetch()}
                  disabled={links.isFetching}
                >
                  {links.isFetching ? "Retrying…" : "Retry"}
                </button>
              </span>
            </WarningNote>
          ) : null}
          {(links.data ?? []).length === 0 ? (
            <p className="text-sm text-slate-400">Not linked to any matter.</p>
          ) : (
            <div className="space-y-2">
              {(links.data ?? []).map((m) => {
                const unlinkingThis =
                  unlink.isPending &&
                  unlink.variables?.linkId === m.id;
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <Link
                      href={`/matters/${m.matter_id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {m.matter_name}
                    </Link>
                    <button
                      type="button"
                      onClick={() => unlink.mutate({ linkId: m.id, matterId: m.matter_id })}
                      disabled={unlink.isPending}
                      className={`${secondaryButtonClass} px-2 py-0.5 text-xs`}
                    >
                      {unlinkingThis ? "Unlinking…" : "Unlink"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {unlink.isError && unlink.error ? (
        <ErrorNote
          title="Unlink failed"
          message={`${describeError(unlink.error)} The link is still there — try again.`}
        />
      ) : null}

      <div className="border-t border-slate-100 pt-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field label="Link to matter">
              {allMatters.isError && !allMatters.data ? (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  Matters list unavailable — this is a load failure, not an empty workspace.
                </p>
              ) : (
                <select
                  className={inputClass}
                  value={linkMatterId}
                  onChange={(e) => setLinkMatterId(e.target.value)}
                  disabled={allMatters.isLoading || allMatters.isError}
                  data-testid="link-matter-select"
                >
                  <option value="">
                    {allMatters.isLoading ? "Loading matters…" : "Choose matter"}
                  </option>
                  {(allMatters.data ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <button
            type="button"
            onClick={onLink}
            disabled={!linkMatterId || link.isPending || allMatters.isError || allMatters.isLoading}
            className={`${buttonClass} text-xs`}
            data-testid="link-matter-button"
          >
            {link.isPending ? "Linking…" : "Link"}
          </button>
        </div>
        {allMatters.isError ? (
          <div className="mt-2">
            <ErrorNote
              title="Couldn't load matters to link"
              message={`${describeError(allMatters.error)} Retry to pick a matter for linking.`}
              onRetry={() => void allMatters.refetch()}
              pending={allMatters.isFetching}
            />
          </div>
        ) : null}
        {link.isError && link.error ? (
          <div className="mt-2">
            <ErrorNote
              title="Link failed"
              message={`${describeError(link.error)} Your selected matter is preserved — try again or pick another.`}
            />
          </div>
        ) : null}
        {link.isSuccess && !link.isPending ? (
          <p className="mt-2 text-xs text-green-700" data-testid="link-ok">
            Linked ✓
          </p>
        ) : null}
      </div>
    </div>
  );
}
