// EU-D — evidence UI closure (docs/contracts/evidence_ui_closure.md v1.0,
// §EU-D.1). New file inside the EU-D write set.
//
// Status-tab drafts for the evidence detail page:
// - While pristine (no user edits) the displayed values FALL BACK to the
//   current server values, so direct Status-tab entry, entry through Edit
//   and re-entry after a save all start from the server's title/status — an
//   uninitialized or invalid draft can never be submitted (Save is gated on
//   `initialized && valid`).
// - Background refetches never erase drafts: once the user has typed, the
//   drafts are only replaced by an explicit reset, a save reconciliation or
//   navigation. While pristine, the display keeps tracking the server.
// - Navigating to another source resets the drafts to pristine.
// - A successful save reconciles back to pristine ONLY when the user has not
//   edited since the save was issued (revision guard), so a slow response
//   can never overwrite newer edits.

import { useCallback, useEffect, useRef, useState } from "react";
import { SOURCE_STATUSES, type Source, type SourceStatus } from "@/lib/types";

interface Drafts {
  /** null = pristine — display falls back to the server value. */
  title: string | null;
  status: string | null;
}

const PRISTINE: Drafts = { title: null, status: null };

export interface SourceDraftBag {
  /** Value to render in the title input (draft, else server, else ""). */
  title: string;
  /** Value to render in the status select (draft, else server, else ""). */
  status: string;
  /** True when the drafts differ from the current server values. */
  dirty: boolean;
  /** True once server data exists (a submit base is available). */
  initialized: boolean;
  /** Non-empty title + a status from the shipped vocabulary. */
  valid: boolean;
  onTitleChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  /** Explicit "Edit"-style re-sync: back to the current server values. */
  resetFromServer: () => void;
  /** Current edit revision (bumped on every user edit). */
  revision: () => number;
  /**
   * After a successful save: return to pristine only if the user has not
   * edited since the save was issued. Returns true when reconciled; false
   * means newer edits exist and must be preserved.
   */
  reconcileIf: (submittedRevision: number) => boolean;
}

export function useSourceDrafts(source: Source | undefined): SourceDraftBag {
  const [drafts, setDrafts] = useState<Drafts>(PRISTINE);
  const revisionRef = useRef(0);
  const sourceIdRef = useRef<string | null>(null);

  // Navigation to another source (with or without a remount) resets the
  // drafts to pristine: the next source initializes from its own server data.
  useEffect(() => {
    const nextId = source?.id ?? null;
    if (sourceIdRef.current === nextId) return;
    sourceIdRef.current = nextId;
    revisionRef.current = 0;
    setDrafts(PRISTINE);
  }, [source?.id]);

  const onTitleChange = useCallback((value: string) => {
    revisionRef.current += 1;
    setDrafts((d) => ({ ...d, title: value }));
  }, []);

  const onStatusChange = useCallback((value: string) => {
    revisionRef.current += 1;
    setDrafts((d) => ({ ...d, status: value }));
  }, []);

  const resetFromServer = useCallback(() => {
    revisionRef.current = 0;
    setDrafts(PRISTINE);
  }, []);

  const revision = useCallback(() => revisionRef.current, []);

  const reconcileIf = useCallback((submittedRevision: number) => {
    if (revisionRef.current !== submittedRevision) return false; // newer edits exist
    revisionRef.current = 0;
    setDrafts(PRISTINE);
    return true;
  }, []);

  const title = drafts.title ?? source?.title ?? "";
  const status = drafts.status ?? source?.source_status ?? "";
  const dirty =
    (drafts.title !== null || drafts.status !== null) &&
    (title !== (source?.title ?? "") || status !== (source?.source_status ?? ""));
  const initialized = !!source;
  const valid =
    initialized &&
    title.trim().length > 0 &&
    SOURCE_STATUSES.includes(status as SourceStatus);

  return {
    title,
    status,
    dirty,
    initialized,
    valid,
    onTitleChange,
    onStatusChange,
    resetFromServer,
    revision,
    reconcileIf,
  };
}
