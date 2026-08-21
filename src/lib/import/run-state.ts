// Shared, dependency-free rules about whether an import run is still alive.
// Lives outside lib/import/data.ts so the client commit card can use the same
// rule the server enforces, instead of the two drifting apart.

/**
 * Approved rows saved per commit pass. The caller loops until nothing is left,
 * so a 500-row file becomes many short passes instead of one that runs until
 * the platform kills it.
 */
export const STUDENT_IMPORT_COMMIT_CHUNK_SIZE = 40;

/**
 * How long an `importing` batch may go untouched before the run counts as dead.
 * Every chunk writes progress and bumps `updated_at`, so a live import refreshes
 * this well inside the window; only a killed one goes quiet.
 */
export const STALE_IMPORT_RUN_MS = 10 * 60 * 1000;

/**
 * True when a batch claims to be importing but nothing has touched it for long
 * enough that the run must have died. Refusing to act on such a batch is what
 * left three batches permanently stuck in `importing` with rows unapplied.
 */
export function isStaleImportRun(
  batch: { status?: string | null; updatedAt?: string | null; updated_at?: string | null },
  now: number = Date.now(),
) {
  if (batch.status !== "importing") {
    return false;
  }

  const raw = batch.updatedAt ?? batch.updated_at ?? null;
  const touchedAt = raw ? Date.parse(raw) : Number.NaN;

  // An unreadable timestamp means we cannot prove the run is alive. Letting
  // staff retry beats leaving the batch stuck forever.
  if (Number.isNaN(touchedAt)) {
    return true;
  }

  return now - touchedAt > STALE_IMPORT_RUN_MS;
}
