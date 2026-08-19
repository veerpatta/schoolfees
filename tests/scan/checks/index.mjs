/**
 * The check registry.
 *
 * A check is a module with three exports:
 *
 *   export const id = "guards";                     // stable, kebab-case
 *   export const title = "Route and action authorisation";
 *   export async function run({ project, sink, coverage, options }) { … }
 *
 * `run` may not throw for a reason it could have handled — but if it does, the
 * runner catches it and records `coverage.errored(id, error)` rather than
 * dropping the check silently. A check that dies and says nothing turns "we
 * did not look" into "we looked and it was fine", which is the exact failure
 * the coverage ledger exists to prevent.
 *
 * Ordering matters only for legibility of the console output; checks are
 * independent and share nothing but the immutable `project`.
 */

import * as guards from "./guards.mjs";
import * as money from "./money.mjs";
import * as asyncSafety from "./async-safety.mjs";
import * as clientBoundary from "./client-boundary.mjs";
import * as sessionSafety from "./session-safety.mjs";
import * as mirrorDrift from "./mirror-drift.mjs";
import * as i18n from "./i18n.mjs";
import * as deadCode from "./dead-code.mjs";
import * as configRisk from "./config-risk.mjs";
import * as deps from "./deps.mjs";
import * as sqlSafety from "./sql-safety.mjs";

export const CHECKS = [
  guards,
  clientBoundary,
  sessionSafety,
  money,
  asyncSafety,
  mirrorDrift,
  sqlSafety,
  i18n,
  deadCode,
  configRisk,
  deps,
];

export function selectChecks(only) {
  if (!only || only.length === 0) return CHECKS;
  const wanted = new Set(only);
  return CHECKS.filter((check) => wanted.has(check.id));
}
