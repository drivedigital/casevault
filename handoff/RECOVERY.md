# Recovery and interruption runbook

Current 2026-09-12. Read STATUS.md and AGENT_POLICY.md first. Recovery does not
expand a write set, override an approval block or authorize real-data operations.

## 1. First five minutes: observe before changing

1. Record assigned branch, `git status --short`, `git rev-parse HEAD`, available
   refs, and exact intended product/spec checkpoint. Never print remote credential
   configuration or environment secrets. Check objects with `git cat-file -e <sha>^{commit}`.
2. Check existing process tool IDs/log tails (or local owned PIDs), command, elapsed
   time, exit status if available, CPU/RSS, disk/memory, and service health. Do not
   restart an active test merely because an artifact directory is absent.
3. Separate: AI-provider/service error; tool timeout; process exit/browser failure;
   assertion failure; invalid fixture/spec; inaccessible evidence. Unknown stays
   unknown. Git metadata regression does not explain a provider busy response.
4. If a suite is alive, preserve its progress and avoid a duplicate run. Stop only
   your own identified process when necessary; never kill by port or broad name.
5. If edits are approval-blocked, stop. No shell, alternate tool or indirect edit
   to bypass the decision. A closed session is not a request for new credentials.

## 2. Preserve evidence before recovery

- Keep a private external workspace directory (mode0700), outside tracked files.
  Preserve staged and unstaged binary diffs separately and intended untracked
  source/note files. Inventory before copying: never bulk-export data/, .env*,
  credentials, case files, dependency trees, or private Git configuration.
- Backups of source diffs can themselves contain secrets; keep local, inspect and
  redact before sharing. Record paths/hashes, not secret contents.
- Raw test logs/traces go to per-run synthetic-only directories outside Git.
  They may not survive sandbox resets even if git-ignored. External location is
  not a durability guarantee; dependencies/processes are also ephemeral.
- After each bounded batch commit/push a compact redacted run ledger in the
  authorized note: product SHA, verifier SHA, local diff, case IDs, commands,
  start/end, exit, counts, skipped/partial classification and failure excerpts.
  Review screenshots/traces before any approved attachment transfer. Never commit data/.
- A local-only commit is not a remotely delivered checkpoint. Verify push/head
  where permitted; otherwise export the authorized note and report delivery blocked.

## 3. Restored files with stale Git metadata

Observed symptom: HEAD/index regress to an old base while newer restored source
files appear modified/untracked. This is NOT permission to discard the files.

1. Preserve work as above. If GitHub access is available, fetch into remote refs
   on the same assigned branch; no checkout/reset yet. Confirm intended target
   commit and ancestry with the integrator. Never guess the target from file dates.
2. Create a fresh, separate temporary index outside the repository and load the
   intended checkpoint using `GIT_INDEX_FILE=<private-index> git read-tree <sha>`.
   Inspect tracked-file differences and files untracked relative to THAT index:
   `git diff-files --name-status` and `git ls-files --others --exclude-standard`
   with the same GIT_INDEX_FILE. Include deletions, modes and symlinks in review.
   A content hash comparison of a subset alone is insufficient.
3. Classify every delta: expected saved work, unrelated work, unexpected loss or
   unknown. Verify staged/unstaged distinctions were backed up. Do not wholesale
   stage restored files into the real index. Stop on unexpected differences.
4. Only after the complete comparison and explicit recovery approval, reconstruct
   the assigned ref/index to the verified checkpoint WITHOUT changing working
   files. Use a compare-and-swap ref update with the exact expected old SHA and
   read-tree for the real index; recheck branch, tree deltas and status afterward.
   This intentionally replaces staging, so preserve its original contents first.
   Ref mismatch or another process writing Git => stop, not force.
5. Checkpoint only reviewed authorized changes, `git diff --check`, normal push
   to the assigned branch. Never use a blanket hard reset, clean, force-push or
   repository/.git replacement. For ordinary divergence, request normal scoped
   merge/rebase guidance rather than this exceptional metadata repair.

## 4. Closed sessions and missing objects

A merged implementation PR has closed remote access in prior Arena sessions.
If access is explicitly closed or either requested object is absent/unfetchable:
stop remote attempts, preserve the note, and report BLOCKED. Do not guess findings.
For an ordinary authentication error, request GitHub reconnection in Arena; never
ask for a PAT/password/2FA code. Do not treat reconnection as a bypass for closure.

A fresh session uses ITS OWN assigned branch. It must confirm access to both
product and verifier checkpoints BEFORE doing the review. Export local-only notes
as approved attachments/redacted reports; a new sandbox cannot assume it has the
old local commit. Never push/take over a retired branch or replay its whole patch.

## 5. Cumulative patches and report branches

Fetch/read dev-logs without merging it. Inspect every patch path; compare targets
to integration. If needed reconstruct in an isolated temporary index at the
claimed base, not the working tree. Extract only authorized new notes or a reviewed
minimal delta; stale shared docs and already-merged implementation must not replay.
Record origin commit/path and hashes. Preserve original findings as historical,
with explicit corrections/limitations rather than silently promoting them to proof.

## 6. Resume tests in bounded batches

Reinstall existing locked product dependencies only as needed (`npm ci`, venv +
requirements-dev); optional pinned browser/embedded DB tools require current scope
approval and stay outside manifests. First inspect whether old services/artifacts
survived. Use disposable, identified DB/storage/queues, not restored user defaults.
Never run next build while a Next server uses the same .next directory.

Log unbuffered Python progress (`PYTHONUNBUFFERED=1`) and use a line/list reporter.
Capture both stdout/stderr and the real runner exit code (pipefail with tee).
Use no automatic retries while diagnosing; one targeted failure and a smoke first.
Set test AND batch deadlines. At timeout save partial state; do not claim completion
or job failure from time alone. An assertion/deadline failure remains recorded.

Only after integrator reviews the batch expand coverage. Clean up only owned
processes, disposable DB/storage and managed symlinks. Preserve recovery state on
cleanup failure. No blanket deletion of node_modules, user databases or artifacts.

## 7. Data backup/recovery is a separate operation

This Git/source runbook is NOT a case-data backup. The integrated backup script
is still unsafe as recovery assurance: it prints/saves full DB URLs and can report
completion with no dump when pg_dump is missing. Do not run it (including dry run)
into shared logs or rely on make backup as validated recovery. Local-ops0159466 is
an unmerged proposal, not the installed implementation.

Any real-data backup/recovery requires explicit owner approval and verified targets:
quiesce writers; use compatible PostgreSQL tools; protect credentials/private backup
permissions; require a nonempty dump + structural validation + file checksums;
restore only into a NEW disposable database and empty trusted scratch directory;
inspect archive paths before extraction; verify expected rows/original bytes.
Never restore over the working database or publish backups. A mocked unit test or
pg_restore --list is not a restore drill. No such drill is claimed complete.
