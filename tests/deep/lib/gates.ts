import { spawnSync } from "node:child_process";

/**
 * The repo's own verifier scripts, run before and after the sweep.
 *
 * The pairing is the point. `verify-late-fee-health.mjs` failing tells you the
 * ledger is wrong; failing it *after* a run that was clean *before* tells you
 * this run broke it, and that attribution is the difference between a bug
 * report and a shrug.
 *
 * The highest-value one is the late-fee check. Its invariant "no waiver on an
 * already-paid installment" is precisely what the documented waive-before-post
 * bypass produces on an EMI student — the desk calls `waive_late_fee` before
 * the posting RPC, so the posting RPC's guards never see the waiver.
 */

export type GateResult = {
  name: string;
  command: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
};

export type GateSpec = {
  name: string;
  args: string[];
  /** A failure here invalidates the whole run rather than being a finding. */
  fatal?: boolean;
  note: string;
};

function tail(value: string | null, lines = 12): string {
  if (!value) return "";
  return value.split(/\r?\n/).slice(-lines).join("\n").trim();
}

export function runVerifier(name: string, args: string[]): GateResult {
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, args, {
    encoding: "utf8",
    // Verifiers read .env.local themselves; inherit the environment as-is.
    env: process.env,
    timeout: 300_000,
  });

  return {
    name,
    command: `node ${args.join(" ")}`,
    ok: result.status === 0,
    exitCode: result.status,
    durationMs: Date.now() - startedAt,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
  };
}

const TEST_SESSION_ARG = process.env.SCHOOLFEES_SMOKE_SESSION ?? "TEST-2026-27";

/**
 * Before the sweep. A dirty baseline is worth knowing about *before* 45 minutes
 * of testing, and only the missing-session case is fatal — everything else is
 * recorded so a post-run failure can be told apart from a pre-existing one.
 */
export const PRE_GATES: readonly GateSpec[] = [
  {
    name: "required-sessions",
    args: ["scripts/verify-required-sessions.mjs"],
    fatal: true,
    note: "TEST-2026-27 must exist, or every write lands somewhere unintended.",
  },
  {
    name: "late-fee-health/test",
    args: ["scripts/verify-late-fee-health.mjs", "--session", TEST_SESSION_ARG],
    note: "Eight money invariants on the test ledger, so drift is attributable.",
  },
  {
    name: "test-data-in-public",
    args: ["scripts/audit-test-data-in-public.mjs"],
    note: "TEST- rows already leaking into live 2026-27 would be a dirty baseline.",
  },
];

/**
 * After the sweep. These are the checks that turn "the harness clicked things"
 * into "the harness proved nothing broke".
 */
export const POST_GATES: readonly GateSpec[] = [
  {
    name: "late-fee-health/test",
    args: ["scripts/verify-late-fee-health.mjs", "--session", TEST_SESSION_ARG],
    note: "Catches the waive-before-post bypass on an EMI student.",
  },
  {
    name: "test-data-in-public",
    args: ["scripts/audit-test-data-in-public.mjs"],
    note: "A write that crossed into live 2026-27 despite all four locks.",
  },
  {
    name: "live-fee-health",
    args: ["scripts/verify-live-fee-health.mjs"],
    note: "Live totals must be exactly what they were before the run.",
  },
  {
    name: "deep-test-footprint",
    args: ["scripts/verify-deep-test-footprint.mjs"],
    note: "Row budget per run — a double-post means idempotency is broken.",
  },
];

export function runGates(specs: readonly GateSpec[]): GateResult[] {
  return specs.map((spec) => runVerifier(spec.name, spec.args));
}
