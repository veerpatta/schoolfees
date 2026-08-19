/**
 * The AI layer: subsystem reviewers, then adversarial refuters.
 *
 * The eleven static checks answer questions with a right answer — is there a
 * permission call in this file, does this key exist in all three locale
 * dictionaries, does this migration have a guard. They are exhaustive over the
 * source and they cost nothing to run, which is why they run first and why
 * they gate hard.
 *
 * What they cannot ask is whether a correct-looking expression computes the
 * wrong rupee figure. `pending_amount` and `total_pending` are both valid
 * column names; only one of them is right in any given expression, and which
 * one is right depends on whether the caller is a cashier taking money or a
 * repayment plan deciding what is still owed. `20260812001114` patched the
 * function and not the view, and EMI late fees were visible to the Payment
 * Desk and invisible to the dashboard for four days. No regex finds that. A
 * reader who knows the rule does.
 *
 * So this layer hires readers. Seven of them, one per subsystem, each handed
 * the invariants that govern its slice quoted verbatim out of CLAUDE.md and
 * told to bring back at most five defects with a concrete failure scenario.
 * Then every claim goes to three fresh processes whose job is to kill it, and
 * only a claim that two of the three fail to kill is recorded — see
 * `verify.mjs` for why that is three separate invocations and not three turns.
 *
 * Everything here is `heuristic` in `tests/deep/lib/rules.mjs`, and stays
 * heuristic. A model that agrees with itself three times is still a model.
 * `ai.defect-confirmed` is a P1 that reports loudly and gates only under
 * strict; that is the correct amount of authority for a claim whose evidence
 * is that four language models read some code.
 *
 * ── What a pass costs ──────────────────────────────────────────────────────
 *
 * One `claude -p` invocation per subsystem, plus three per claim that survives
 * the mechanical citation pre-check. A default full pass is therefore
 * 7 reviewers + 3 × (claims that cite a real line). At the default cap of five
 * claims each that is 7 + up to 105 = up to 112 invocations worst case;
 * in practice reviewers raise two or three apiece and it lands near 70, taking
 * 10-20 minutes wall-clock at three in flight. Cut it with
 * `--ai-subsystems fees,payments` (one reviewer each) or `--ai-max-claims 2`,
 * and for a cheap exploratory sweep use `--no-verify`, which skips refutation
 * entirely — 7 invocations, everything recorded as `ai.defect-suspected`.
 *
 * ── Flags ──────────────────────────────────────────────────────────────────
 *
 *   --ai-subsystems fees,payments   only these (default: all seven)
 *   --ai-max-claims 3               per-reviewer cap (default 5)
 *   --no-verify                     skip refutation; record as suspected
 *   --ai-timeout 900                per-invocation seconds (default 600)
 *   --ai-claims-file <path>         skip reviewers, read candidates from JSON.
 *                                   For exercising the pipeline — including the
 *                                   citation pre-check — without paying for a
 *                                   review pass.
 *
 * ── What it writes ─────────────────────────────────────────────────────────
 *
 * Every reviewer and refuter transcript lands in `<runDir>/ai/`, which is under
 * the gitignored `docs/smoke-reports/scan/`. Deliberately not `docs/qa/scan/`,
 * which is committed: a transcript is a model's unedited reasoning about
 * production financial code, it is long, and it is exactly the kind of thing
 * that should be auditable for a week and not present in the repository
 * forever.
 *
 * ── What it never does ─────────────────────────────────────────────────────
 *
 * Throw. `run.mjs` catches, but a layer that reports "0 findings" when the CLI
 * was missing from PATH is precisely the lie the coverage ledger exists to
 * prevent. Every failure — no binary, auth refused, timeout, rate limit, prose
 * where JSON was asked for — ends in a `coverage.declare` that says so.
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { SUBSYSTEMS, selectSubsystems } from "./subsystems.mjs";
import { extractJsonBlock, precheckCitation, verifyClaim } from "./verify.mjs";

/** The named schema reviewers are asked for. Never trusted; always validated. */
const CLAIMS_SCHEMA = "SCAN_AI_CLAIMS_V1";

const DEFAULT_MAX_CLAIMS = 5;
const DEFAULT_TIMEOUT_SECONDS = 600;
/** Reviewers and refuters share one budget: at most this many CLIs at once. */
const CONCURRENCY = 3;

/* ─────────────────────────────────────────────────────────────── flags */

function readFlags(args) {
  const has = (name) => args.includes(`--${name}`);
  const value = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
      ? args[index + 1]
      : fallback;
  };
  const list = (name) =>
    (value(name, "") || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const maxClaims = Number.parseInt(value("ai-max-claims", ""), 10);
  const timeout = Number.parseInt(value("ai-timeout", ""), 10);

  return {
    subsystemIds: list("ai-subsystems"),
    maxClaims: Number.isInteger(maxClaims) && maxClaims > 0 ? maxClaims : DEFAULT_MAX_CLAIMS,
    verify: !has("no-verify"),
    timeoutMs: (Number.isInteger(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_SECONDS) * 1000,
    claimsFile: value("ai-claims-file", ""),
  };
}

/* ───────────────────────────────────────────────────────── the CLI driver */

/**
 * One `claude -p` invocation, resolved rather than thrown.
 *
 * The envelope this parses is the one the binary actually emits, checked by
 * hand before any of this was written rather than assumed:
 *
 *   { "type": "result", "subtype": "success", "is_error": false,
 *     "result": "<the assistant's final text>", "num_turns": 3,
 *     "session_id": "…", "total_cost_usd": 0.21, "permission_denials": [] }
 *
 * Three details that matter and are not guessable:
 *
 *   - The text is in `result`, and `result` is **null** on failure. A parser
 *     that reads `result` unconditionally gets "null" as a review.
 *   - Failure still emits the envelope, with `is_error: true` and a `subtype`
 *     naming the cause (`error_max_turns` is the one you will actually hit).
 *     Exit code is 1. So the exit code alone is not the signal — read both.
 *   - The binary writes advisory noise to **stderr** (an untrusted-workspace
 *     warning, for one). Merging the streams corrupts the JSON, so stdout and
 *     stderr are captured separately and only stdout is parsed.
 *
 * `--max-turns` exists and is used: a reviewer that has not converged after
 * forty turns of Grep is not about to, and the cap turns a runaway into a
 * recorded degradation instead of a stalled scan. Tools are limited to
 * Read, Grep and Glob — this layer reads the repository and writes nothing to
 * it, and an agent that cannot call Edit cannot be talked into calling it.
 */
function askClaude({ root, timeoutMs, maxTurns = 40 }) {
  return ({ prompt, label, timeoutMs: perCall }) =>
    new Promise((resolve) => {
      const startedAt = Date.now();
      const limit = perCall ?? timeoutMs;
      let child;
      try {
        child = spawn(
          "claude",
          [
            "-p",
            prompt,
            "--output-format",
            "json",
            "--allowedTools",
            "Read,Grep,Glob",
            "--max-turns",
            String(maxTurns),
          ],
          { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
        );
      } catch (error) {
        resolve({ ok: false, label, error: `spawn failed: ${String(error?.message ?? error)}` });
        return;
      }

      let stdout = "";
      let stderr = "";
      let settled = false;
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        resolve({
          ok: false,
          label,
          error: `timed out after ${Math.round(limit / 1000)}s`,
          durationMs: Date.now() - startedAt,
          stderr: stderr.slice(-800),
        });
      }, limit);

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // ENOENT here is the one worth naming: `claude` is not on PATH, which
        // is a machine problem and not a code problem, and the coverage note
        // has to say so rather than reporting a clean subsystem.
        const reason =
          error?.code === "ENOENT"
            ? "the `claude` CLI is not on PATH"
            : `spawn error: ${String(error?.message ?? error)}`;
        resolve({ ok: false, label, error: reason, durationMs: Date.now() - startedAt });
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const durationMs = Date.now() - startedAt;

        let envelope = null;
        const brace = stdout.indexOf("{");
        if (brace >= 0) {
          try {
            envelope = JSON.parse(stdout.slice(brace));
          } catch {
            envelope = null;
          }
        }

        if (!envelope) {
          resolve({
            ok: false,
            label,
            error:
              code === 0
                ? "CLI produced no parseable JSON envelope"
                : `CLI exited ${code} with no parseable JSON envelope`,
            durationMs,
            stdout: stdout.slice(-800),
            stderr: stderr.slice(-800),
          });
          return;
        }

        if (envelope.is_error || typeof envelope.result !== "string") {
          resolve({
            ok: false,
            label,
            error: `CLI reported ${envelope.subtype ?? "an error"}`,
            durationMs,
            costUsd: envelope.total_cost_usd ?? null,
            sessionId: envelope.session_id ?? null,
          });
          return;
        }

        resolve({
          ok: true,
          label,
          text: envelope.result,
          durationMs,
          turns: envelope.num_turns ?? null,
          costUsd: envelope.total_cost_usd ?? null,
          sessionId: envelope.session_id ?? null,
          denials: envelope.permission_denials ?? [],
        });
      });
    });
}

/** Is the binary there at all? One cheap synchronous question, asked once. */
function claudeAvailable() {
  try {
    const probe = spawnSync("claude", ["--version"], { encoding: "utf8", timeout: 60_000 });
    if (probe.error) return { ok: false, reason: `\`claude --version\` failed: ${probe.error.code ?? probe.error.message}` };
    if (probe.status !== 0) return { ok: false, reason: `\`claude --version\` exited ${probe.status}` };
    return { ok: true, version: String(probe.stdout ?? "").trim() };
  } catch (error) {
    return { ok: false, reason: String(error?.message ?? error) };
  }
}

/* ──────────────────────────────────────────────────────── reviewer prompt */

function reviewerPrompt({ subsystem, maxClaims }) {
  return [
    `You are reviewing one subsystem of a production school fee-management app for defects.`,
    `The repository is your working directory. You have Read, Grep and Glob over it. Use them —`,
    `read the actual files before claiming anything about them. Write nothing.`,
    ``,
    `# Subsystem: ${subsystem.title}`,
    ``,
    `Files in scope (expand with Glob):`,
    ...subsystem.files.map((glob) => `  ${glob}`),
    ``,
    `You may read anything else in the repository as supporting context — migrations under`,
    `supabase/migrations, callers, tests — but every claim you make must be located inside a`,
    `file in the scope above.`,
    ``,
    `# Invariants this subsystem must uphold`,
    ``,
    `These are quoted verbatim from CLAUDE.md, which is authoritative for this repository.`,
    `A defect here is usually a place where one of these is violated in a way that produces a`,
    `wrong number, a wrong permission, or a lost record.`,
    ``,
    ...subsystem.invariants.map((invariant, index) => `## Invariant ${index + 1}\n\n${invariant}\n`),
    `# What to look for`,
    ``,
    subsystem.focus,
    ``,
    `Two kinds of claim are wanted:`,
    ``,
    `  "defect"                — code that produces a wrong result for some input.`,
    `  "invariant-unenforced"  — an invariant CLAUDE.md states in prose that nothing in the`,
    `                            code, no test, and no database constraint actually enforces,`,
    `                            so the next edit can break it silently. Cite the place the`,
    `                            enforcement should live.`,
    ``,
    `# What is NOT wanted`,
    ``,
    `Do not report style, naming, formatting, missing tests as a category, type-safety`,
    `preferences, "consider extracting", "this could be clearer", duplication, TODO comments,`,
    `or anything you would phrase as a suggestion. If you cannot state concrete inputs and the`,
    `specific wrong output they produce, it is not a claim — leave it out. Returning one solid`,
    `claim is a better review than returning five weak ones. Returning zero is a valid answer`,
    `and is preferred over padding.`,
    ``,
    `Every claim will be independently attacked by three separate reviewers whose job is to`,
    `refute it, so a claim you cannot defend by quoting code costs you and is discarded.`,
    ``,
    `# Answer format`,
    ``,
    `At most ${maxClaims} claims. Reply with one fenced JSON block and nothing after it:`,
    ``,
    "```json",
    JSON.stringify(
      {
        schema: CLAIMS_SCHEMA,
        subsystem: subsystem.id,
        claims: [
          {
            file: "repo-relative path, e.g. lib/fees/policy.ts — must be a real file you read",
            line: 0,
            severity: "P1 or P2",
            kind: "defect or invariant-unenforced",
            invariant: "which invariant above is at stake, or null",
            claim: "one sentence: what is wrong, naming the expression or column",
            failureScenario:
              "concrete inputs -> the specific wrong output. Name values, not categories.",
            whyNotAlreadyCaught:
              "why the typechecker, the existing tests, and the static scan all pass on this",
            fix: "the smallest change that resolves it",
          },
        ],
      },
      null,
      2,
    ),
    "```",
    ``,
    `The line number must be the line you are actually accusing, in the file you actually read.`,
    `A citation that does not resolve is discarded before anyone looks at the claim.`,
  ].join("\n");
}

/* ───────────────────────────────────────────────────────── claim handling */

const VALID_KINDS = new Set(["defect", "invariant-unenforced"]);

/**
 * Take only what was asked for, and say what was dropped.
 *
 * Field-by-field rather than trusting the shape: a reviewer occasionally
 * returns `line: "142"`, or a `claims` object instead of an array, or a claim
 * whose `failureScenario` is the string "N/A" — and a claim with no scenario is
 * the exact thing the prompt forbids, so it is dropped here rather than sent to
 * three refuters who will each spend a turn discovering there is nothing to
 * refute.
 */
function readClaims(parsed, subsystem, maxClaims) {
  const rejected = [];
  if (!parsed || !Array.isArray(parsed.claims)) {
    return { claims: [], rejected: ["reviewer returned no `claims` array"] };
  }

  const claims = [];
  for (const raw of parsed.claims) {
    if (claims.length >= maxClaims) {
      rejected.push(`over the ${maxClaims}-claim cap`);
      break;
    }
    if (!raw || typeof raw !== "object") {
      rejected.push("claim was not an object");
      continue;
    }
    const claim = {
      subsystem: subsystem.id,
      file: typeof raw.file === "string" ? raw.file.trim() : "",
      line: Number.parseInt(raw.line, 10),
      severity: raw.severity === "P2" ? "P2" : "P1",
      kind: VALID_KINDS.has(raw.kind) ? raw.kind : "defect",
      invariant: typeof raw.invariant === "string" ? raw.invariant.slice(0, 400) : null,
      claim: typeof raw.claim === "string" ? raw.claim.trim() : "",
      failureScenario: typeof raw.failureScenario === "string" ? raw.failureScenario.trim() : "",
      whyNotAlreadyCaught:
        typeof raw.whyNotAlreadyCaught === "string" ? raw.whyNotAlreadyCaught.trim() : "",
      fix: typeof raw.fix === "string" ? raw.fix.trim() : "",
    };
    if (claim.claim.length < 10) {
      rejected.push(`empty or trivial claim text on ${claim.file || "(no file)"}`);
      continue;
    }
    if (claim.failureScenario.length < 20 || /^n\/?a$/i.test(claim.failureScenario)) {
      rejected.push(`no concrete failure scenario on ${claim.file || "(no file)"}`);
      continue;
    }
    claims.push(claim);
  }
  return { claims, rejected };
}

/** Bounded parallelism. Small enough to inline; the alternative is a dependency. */
async function pooled(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

function claimKey(claim) {
  return `${claim.subsystem}-${claim.file.replace(/[^a-z0-9]+/gi, "-")}-${claim.line}`.slice(0, 100);
}

/* ────────────────────────────────────────────────────────────── the layer */

export async function runAiLayer({ project, sink, coverage, root, runDir, args = [] }) {
  const flags = readFlags(args);
  const aiDir = path.join(runDir, "ai");
  try {
    mkdirSync(aiDir, { recursive: true });
  } catch {
    // A run directory we cannot write to costs us the transcripts, not the run.
  }

  const write = (name, payload) => {
    try {
      writeFileSync(path.join(aiDir, name), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    } catch {
      /* transcripts are an audit convenience, never a precondition */
    }
  };

  const { selected, unknown } = selectSubsystems(flags.subsystemIds);
  const log = (id, message) => console.log(`  ${String(id).padEnd(16)} ${message}`);

  if (unknown.length > 0) {
    // Naming a subsystem that does not exist and reviewing the rest would
    // report a clean pass for code nobody looked at. Say it, and count it.
    log("ai", `unknown subsystem(s): ${unknown.join(", ")} — known: ${SUBSYSTEMS.map((s) => s.id).join(", ")}`);
  }

  if (selected.length === 0) {
    coverage.declare({
      check: "ai",
      dimension: "subsystem reviews",
      domainSize: SUBSYSTEMS.length,
      examined: 0,
      strategy: "errored",
      note:
        `No subsystem was reviewed: --ai-subsystems named ${JSON.stringify(flags.subsystemIds)} `
        + `and none of those exist. Valid ids: ${SUBSYSTEMS.map((s) => s.id).join(", ")}. `
        + "Nothing in this layer looked at anything.",
      errored: true,
    });
    log("ai", "no subsystem selected — nothing reviewed");
    return;
  }

  const ask = askClaude({ root, timeoutMs: flags.timeoutMs });
  const usingFixture = flags.claimsFile.length > 0;

  /* ── reviewers ──────────────────────────────────────────────────────── */

  let candidates = [];
  let reviewed = 0;
  const reviewerFailures = [];
  const rejectedByReviewer = [];

  if (usingFixture) {
    // The pipeline without the review pass: candidates come from a file. This
    // exists so the parts that are cheap to get wrong — citation checking,
    // survival arithmetic, finding shape — can be exercised for free and,
    // more usefully, so a claim can be replayed against a later commit.
    try {
      const { readFileSync } = await import("node:fs");
      const raw = JSON.parse(readFileSync(path.resolve(root, flags.claimsFile), "utf8"));
      const list = Array.isArray(raw) ? raw : (raw?.claims ?? []);
      const byId = new Map(SUBSYSTEMS.map((subsystem) => [subsystem.id, subsystem]));
      for (const entry of list) {
        const subsystem = byId.get(entry?.subsystem) ?? selected[0];
        const { claims } = readClaims({ claims: [entry] }, subsystem, flags.maxClaims);
        candidates.push(...claims);
      }
      reviewed = selected.length;
      log("ai", `${candidates.length} candidate(s) from ${flags.claimsFile} (reviewers skipped)`);
    } catch (error) {
      coverage.declare({
        check: "ai",
        dimension: "subsystem reviews",
        domainSize: SUBSYSTEMS.length,
        examined: 0,
        strategy: "errored",
        note: `--ai-claims-file ${flags.claimsFile} could not be read: ${String(error?.message ?? error)}`,
        errored: true,
      });
      log("ai", `claims file unreadable — ${String(error?.message ?? error).slice(0, 80)}`);
      return;
    }
  } else {
    const availability = claudeAvailable();
    if (!availability.ok) {
      coverage.declare({
        check: "ai",
        dimension: "subsystem reviews",
        domainSize: SUBSYSTEMS.length,
        examined: 0,
        strategy: "errored",
        note:
          `The AI layer never ran: ${availability.reason}. `
          + "No subsystem was reviewed. This is a clean report for code nobody read — "
          + "install the CLI, or drop `ai` from --layers so the omission is explicit.",
        errored: true,
      });
      log("ai", `unavailable — ${availability.reason}`);
      return;
    }
    log("ai", `claude ${availability.version} · ${selected.length} subsystem(s) · ${CONCURRENCY} in flight`);

    const reviews = await pooled(selected, CONCURRENCY, async (subsystem) => {
      const answer = await ask({
        prompt: reviewerPrompt({ subsystem, maxClaims: flags.maxClaims }),
        label: `review:${subsystem.id}`,
      });
      write(`reviewer-${subsystem.id}.json`, {
        subsystem: subsystem.id,
        files: subsystem.files,
        maxClaims: flags.maxClaims,
        answer,
      });
      return { subsystem, answer };
    });

    for (const { subsystem, answer } of reviews) {
      if (!answer.ok) {
        reviewerFailures.push({ subsystem: subsystem.id, error: answer.error });
        log(subsystem.id, `review FAILED  ${answer.error}`);
        continue;
      }
      const parsed = extractJsonBlock(answer.text, CLAIMS_SCHEMA);
      if (!parsed) {
        // Prose where JSON was asked for. The subsystem is unreviewed, not
        // clean, and the difference is the whole point of the ledger.
        reviewerFailures.push({ subsystem: subsystem.id, error: "returned no parseable JSON block" });
        log(subsystem.id, `review UNPARSEABLE  ${String(answer.text).slice(0, 60).replace(/\s+/g, " ")}…`);
        continue;
      }
      reviewed += 1;
      const { claims, rejected } = readClaims(parsed, subsystem, flags.maxClaims);
      rejectedByReviewer.push(...rejected.map((reason) => `${subsystem.id}: ${reason}`));
      candidates.push(...claims);
      log(
        subsystem.id,
        `${String(claims.length).padStart(4)} claim(s)  ${Math.round(answer.durationMs / 1000)}s`
          + `  $${(answer.costUsd ?? 0).toFixed(2)}`,
      );
    }
  }

  write("candidates.json", { count: candidates.length, rejected: rejectedByReviewer, candidates });

  /* ── the free half of verification ──────────────────────────────────── */

  const checked = [];
  const deadOnArrival = [];
  for (const claim of candidates) {
    const precheck = precheckCitation({ root, claim });
    if (!precheck.ok) {
      deadOnArrival.push({ claim, reason: precheck.reason });
      log(claim.subsystem, `precheck KILLED  ${precheck.reason}`);
      continue;
    }
    claim.file = precheck.file;
    checked.push({ claim, evidence: precheck.evidence });
  }
  write("precheck.json", {
    passed: checked.length,
    killed: deadOnArrival.map((entry) => ({ file: entry.claim.file, line: entry.claim.line, reason: entry.reason })),
  });

  /* ── refutation ─────────────────────────────────────────────────────── */

  const byId = new Map(SUBSYSTEMS.map((subsystem) => [subsystem.id, subsystem]));
  let confirmed = 0;
  let suspected = 0;
  let killed = deadOnArrival.length;

  for (const { claim, evidence } of checked) {
    const subsystem = byId.get(claim.subsystem) ?? selected[0];

    let outcome = "unverified";
    let verdict = null;
    if (flags.verify) {
      verdict = await verifyClaim({
        claim,
        subsystem,
        evidence,
        ask,
        timeoutMs: flags.timeoutMs,
      });
      outcome = verdict.outcome;
      write(`refuters-${claimKey(claim)}.json`, { claim, evidence, verdict });
      log(
        claim.subsystem,
        `${claim.file}:${claim.line} ${outcome.toUpperCase()}`
          + ` (${verdict.survivedCount}/${verdict.usableCount} not-refuted)`,
      );
    }

    if (outcome === "refuted") {
      killed += 1;
      continue;
    }

    // `--no-verify` records everything that cited a real line, as suspected.
    // Nothing gets `ai.defect-confirmed` without having survived refutation:
    // the confirmed rule's entire meaning is "three independent processes
    // tried to kill this and two failed", and a flag must not be able to
    // manufacture that.
    const survived = flags.verify && outcome === "survived";
    const rule = survived
      ? claim.kind === "invariant-unenforced"
        ? "ai.invariant-unenforced"
        : "ai.defect-confirmed"
      : "ai.defect-suspected";

    if (rule === "ai.defect-confirmed") confirmed += 1;
    else suspected += 1;

    const standing = !flags.verify
      ? "Recorded without refutation (--no-verify): one model's unchallenged reading."
      : outcome === "survived"
        ? `Survived refutation: ${verdict.survivedCount} of ${verdict.usableCount} independent refuters could not kill it.`
        : outcome === "split"
          ? `Refuters split: 1 of ${verdict.usableCount} could not kill it. Plausible, not established.`
          : "Refutation did not complete — no refuter returned a usable verdict, so this is unverified.";

    sink.record({
      rule,
      file: claim.file,
      line: claim.line,
      title: claim.claim.slice(0, 200),
      expected:
        claim.invariant
        ?? `${subsystem.title} upholds the invariants CLAUDE.md states for it.`,
      actual: `${claim.claim}\n\nFailure scenario: ${claim.failureScenario}`,
      evidence,
      why:
        `${standing}\n\n`
        + `Why the existing gates pass on it: ${claim.whyNotAlreadyCaught || "not stated by the reviewer."}\n\n`
        + (verdict
          ? `Refuter verdicts:\n${verdict.votes
              .map((vote) => `  - ${vote.lens}: ${vote.refuted ? "refuted" : "could not refute"} — ${vote.reason}`)
              .join("\n")}`
          : "No refuters were run."),
      fix:
        claim.fix
        || "Read the cited line against the quoted invariant and decide; this claim is model-authored.",
      reproCommand: `node tests/scan/run.mjs --layers ai --ai-subsystems ${claim.subsystem}`,
    });
  }

  /* ── the ledger ─────────────────────────────────────────────────────── */

  write("summary.json", {
    subsystems: selected.map((subsystem) => subsystem.id),
    reviewed,
    candidates: candidates.length,
    precheckKilled: deadOnArrival.length,
    confirmed,
    suspected,
    refuted: killed - deadOnArrival.length,
    verify: flags.verify,
    reviewerFailures,
  });

  const notes = [
    "Reviewers read source only. They cannot run the app, execute a query, or see production "
      + "data, so a defect that only appears against a particular row — the ₹17,250 the "
      + "population rule hid — is invisible here and belongs to tests/deep and the verify "
      + "scripts.",
    "Nothing here is deterministic. A survivor is a claim three independent processes failed "
      + "to kill, which is evidence and not proof; re-running may produce a different set.",
    `${deadOnArrival.length} claim(s) died to the citation pre-check before any refuter ran.`,
  ];
  if (reviewerFailures.length > 0) {
    notes.unshift(
      `**${reviewerFailures.length} reviewer(s) contributed nothing** (`
        + `${reviewerFailures.map((failure) => `${failure.subsystem}: ${failure.error}`).join("; ")}`
        + "). Those subsystems are unreviewed, not clean.",
    );
  }
  if (!flags.verify) {
    notes.unshift(
      "Refutation was skipped (--no-verify). Every finding here is one model's unchallenged "
        + "reading and is recorded as suspected; none can be a confirmed defect.",
    );
  }

  // A targeted run declares `targeted`, which by design does not count as a
  // coverage gap — asking for one subsystem is a choice, not an omission. But
  // a run where *every* reviewer it dispatched came back empty-handed produced
  // no review at all, and letting that pass as `targeted` is the same silence
  // as a check that threw on its first file. It is recorded as `errored` so
  // the gate fails, exactly as the static layer does when a check dies.
  const nothingReviewed = reviewed === 0 && !usingFixture;
  coverage.declare({
    check: "ai",
    dimension: "subsystem reviews",
    domainSize: SUBSYSTEMS.length,
    examined: reviewed,
    strategy: nothingReviewed
      ? "errored"
      : flags.subsystemIds.length > 0
        ? "targeted"
        : "exhaustive",
    errored: nothingReviewed || undefined,
    skipped: SUBSYSTEMS.filter((subsystem) => !selected.includes(subsystem)).map((subsystem) => subsystem.id),
    note: nothingReviewed
      ? `Every reviewer dispatched (${selected.map((subsystem) => subsystem.id).join(", ")}) `
        + `failed to return a usable review. ${notes.join(" ")}`
      : notes.join(" "),
  });

  log(
    "ai",
    `${confirmed} confirmed · ${suspected} suspected · ${killed} killed`
      + ` (${deadOnArrival.length} on citation, ${killed - deadOnArrival.length} by refuters)`
      + ` · ${project.source.length} source files in repo`,
  );
}
