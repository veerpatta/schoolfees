import { appendFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { bulkDir } from "./artifacts";
import type { Finding } from "./findings";

/**
 * Getting findings and coverage out of the worker processes.
 *
 * Playwright workers are separate OS processes, so a `FindingSink` living in a
 * worker's module scope is invisible to `globalTeardown` — which is where the
 * gate runs. Everything therefore streams to append-only JSONL under the run
 * directory, and teardown replays it. Append-only also means a worker that
 * crashes still leaves behind everything it found before it died.
 */

function streamPath(name: string): string {
  return path.join(bulkDir(), `${name}.jsonl`);
}

function append(name: string, payload: unknown): void {
  appendFileSync(streamPath(name), `${JSON.stringify(payload)}\n`, "utf8");
}

/**
 * Read a stream, tolerating a damaged line.
 *
 * A run that is killed mid-write leaves a partial or NUL-padded record behind,
 * and a single `JSON.parse` throw took the whole teardown down with it — so the
 * coverage ledger silently kept the previous run's numbers and the report was
 * quietly stale. Losing one event is acceptable; losing the ledger is not.
 */
/** Matches the NUL bytes a torn append leaves behind. */
const NUL_PADDING = new RegExp(String.fromCharCode(0) + "+", "g");

function readAll<T>(name: string): T[] {
  const file = streamPath(name);
  if (!existsSync(file)) return [];

  const rows: T[] = [];
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    // NUL padding only — never ordinary whitespace, which is meaningful
    // inside the JSON string values these records carry.
    const line = raw.replace(NUL_PADDING, "").trim();
    if (!line) continue;
    try {
      rows.push(JSON.parse(line) as T);
    } catch {
      // A torn record from an interrupted run. Skipped, not fatal.
    }
  }
  return rows;
}

export function writeFinding(finding: Finding): void {
  append("findings", finding);
}

export function readFindings(): Finding[] {
  return readAll<Finding>("findings");
}

export type CoverageEvent =
  | { kind: "visit"; dimension: string; value: string }
  | { kind: "pair"; dimension: string; a: string; b: string };

export function writeCoverageEvent(event: CoverageEvent): void {
  append("coverage", event);
}

export function readCoverageEvents(): CoverageEvent[] {
  return readAll<CoverageEvent>("coverage");
}

export type WriteLedgerEntry = {
  table: string;
  operation: string;
  identifier: string;
  caseId: string;
  session: string;
  target: string;
  note?: string;
};

/** Every row a run created, so it can be found — or reversed — by hand. */
export function writeLedgerEntry(entry: WriteLedgerEntry): void {
  append("write-ledger", entry);
}

export function readWriteLedger(): WriteLedgerEntry[] {
  return readAll<WriteLedgerEntry>("write-ledger");
}

export type TimingEntry = {
  surface: string;
  device: string;
  target: string;
  loadMs: number;
};

export function writeTiming(entry: TimingEntry): void {
  append("timings", entry);
}

export function readTimings(): TimingEntry[] {
  return readAll<TimingEntry>("timings");
}
