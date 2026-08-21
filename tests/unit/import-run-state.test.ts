import { describe, expect, it } from "vitest";

import {
  STALE_IMPORT_RUN_MS,
  STUDENT_IMPORT_COMMIT_CHUNK_SIZE,
  isStaleImportRun,
} from "@/modules/imports/domain/run-state";

const NOW = Date.parse("2026-08-06T09:00:00.000Z");
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("import run staleness", () => {
  it("treats a batch that is not importing as never stale", () => {
    for (const status of ["uploaded", "validated", "completed", "failed"]) {
      expect(isStaleImportRun({ status, updatedAt: at(STALE_IMPORT_RUN_MS * 10) }, NOW)).toBe(
        false,
      );
    }
  });

  it("keeps a freshly-touched import locked", () => {
    expect(isStaleImportRun({ status: "importing", updatedAt: at(0) }, NOW)).toBe(false);
    expect(isStaleImportRun({ status: "importing", updatedAt: at(60_000) }, NOW)).toBe(false);
    expect(
      isStaleImportRun({ status: "importing", updatedAt: at(STALE_IMPORT_RUN_MS - 1) }, NOW),
    ).toBe(false);
  });

  // This is the case that stranded three real batches: killed mid-run, status
  // left at `importing`, and every later attempt refused.
  it("frees an import that has gone quiet past the window", () => {
    expect(
      isStaleImportRun({ status: "importing", updatedAt: at(STALE_IMPORT_RUN_MS + 1) }, NOW),
    ).toBe(true);
    expect(
      isStaleImportRun({ status: "importing", updatedAt: at(24 * 60 * 60 * 1000) }, NOW),
    ).toBe(true);
  });

  it("frees a run whose timestamp cannot be read, rather than locking forever", () => {
    expect(isStaleImportRun({ status: "importing", updatedAt: null }, NOW)).toBe(true);
    expect(isStaleImportRun({ status: "importing", updatedAt: "not a date" }, NOW)).toBe(true);
    expect(isStaleImportRun({ status: "importing" }, NOW)).toBe(true);
  });

  it("accepts either the camelCase or the raw column name", () => {
    expect(isStaleImportRun({ status: "importing", updated_at: at(0) }, NOW)).toBe(false);
    expect(
      isStaleImportRun({ status: "importing", updated_at: at(STALE_IMPORT_RUN_MS + 1) }, NOW),
    ).toBe(true);
  });

  it("keeps the chunk size small enough to finish well inside a request", () => {
    // The killed run averaged ~0.7s per row; 40 rows is ~30s, inside the 45s
    // action budget and far inside the 60s function ceiling.
    expect(STUDENT_IMPORT_COMMIT_CHUNK_SIZE).toBeGreaterThan(0);
    expect(STUDENT_IMPORT_COMMIT_CHUNK_SIZE * 0.7).toBeLessThan(45);
  });
});
