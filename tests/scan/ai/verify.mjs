/**
 * Trying to kill a claim before believing it.
 *
 * A reviewer that has just spent its whole turn budget reading `lib/fees` is
 * the worst possible judge of whether what it found is real. It has already
 * committed to the reading, it has no memory of the twelve other places the
 * value gets clamped, and asking it "are you sure?" gets "yes" for the same
 * reason a person asked that question says yes. So the claim leaves the
 * reviewer and goes to three fresh processes whose entire job is to destroy it.
 *
 * Three properties make that more than theatre:
 *
 * **The refuters are independent.** Separate `claude -p` invocations, no shared
 * session, no sight of each other's verdicts and no sight of the reviewer's
 * reasoning beyond the claim itself. Three turns of one conversation would
 * agree with itself; three processes at least have to arrive separately.
 *
 * **They get different lenses.** Asking the same question three times measures
 * sampling noise. The three questions here are genuinely different — does the
 * code say what the claim says it says, does something *else* already prevent
 * it, and can the scenario actually happen in this app — and a claim usually
 * dies to exactly one of them. The `useAdmin` class of bug dies to lens B
 * (the caller already passes it); the "late fee double-counted" class dies to
 * lens A (the expression reads `pending_amount`, not `total_pending`, and the
 * reviewer misread which); the "concurrent posting duplicates a receipt" class
 * dies to lens C (the RPC takes a per-student advisory lock).
 *
 * **Uncertainty kills.** Every refuter is told to answer `refuted: true` when
 * it cannot tell, and a refuter that fails to run, times out or returns prose
 * counts as a refutation too. This layer's failure mode is not missing a bug —
 * `tests/deep` and the eleven static checks are the ones with a coverage
 * claim to keep. Its failure mode is a P1 that wastes an afternoon, and three
 * of those is how a heuristic rule gets added to the noise budget and stops
 * being read.
 *
 * Before any of that costs a token, the citation is checked mechanically. A
 * claim naming `lib/fees/late-fee.ts` — a file this repo does not have — is
 * dead on arrival, and so is one pointing at line 400 of a 120-line module. No
 * model can vouch for a citation that is not there, and asking three of them to
 * try costs three invocations to learn something `statSync` knows for free.
 */

import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The named schema every refuter is asked to emit. Validated, not trusted. */
export const REFUTATION_SCHEMA = "SCAN_AI_REFUTATION_V1";

/**
 * The three lenses.
 *
 * `id` travels into the transcript filename and into the finding's `why`, so a
 * person auditing a survivor six weeks later can see which question it was that
 * failed to kill it.
 */
export const REFUTER_LENSES = [
  {
    id: "reads",
    title: "Does the code actually do what the claim says?",
    instruction:
      "Open the cited file and read it. Quote the exact lines — verbatim, with their line "
      + "numbers — that the claim depends on. Then decide whether those lines really do what "
      + "the claim says they do. Reviewers misread which column an expression uses, which "
      + "branch is the default, and which of two similarly-named helpers is being called. If "
      + "the quoted code does not plainly support the claim, the claim is refuted. If the "
      + "cited line is not the code the claim describes at all, the claim is refuted.",
  },
  {
    id: "guarded",
    title: "Is something else already preventing this?",
    instruction:
      "Assume the claim reads the code correctly, and go looking for the thing that stops it "
      + "anyway. Search for: a database CHECK constraint, trigger, RLS policy or RPC guard in "
      + "supabase/migrations; a caller that already validates or clamps the value before "
      + "passing it; a Zod or TypeScript type that makes the bad input unrepresentable; an "
      + "existing test in tests/ that would fail if the defect were real. Use Grep widely — "
      + "the guard is usually in a different directory from the defect. If any such guard "
      + "exists and covers the scenario, the claim is refuted.",
  },
  {
    id: "reachable",
    title: "Can this scenario actually happen here?",
    instruction:
      "Judge the failure scenario as a description of something that can happen to this "
      + "school. This is a single-tenant internal admin app for office staff — not a public "
      + "API, not multi-tenant, not a parent portal. Inputs arrive from staff on a guarded "
      + "screen or from a cron with a shared secret. Ask whether any real caller can produce "
      + "the stated inputs, whether the code path is dead or unreachable, and whether the "
      + "'wrong output' would be visibly wrong to the person looking at it. If the scenario "
      + "needs an input no caller can produce, or a path nothing reaches, the claim is refuted.",
  },
];

/**
 * Pull the last fenced JSON block that parses and carries the expected schema.
 *
 * Last, not first, because a model that reconsiders emits a corrected block
 * after the draft. Schema-tagged, because a reviewer sometimes quotes a JSON
 * fragment out of the repo on its way to the answer and that fragment parses
 * perfectly well. If nothing fenced works, one bare-braces attempt is made —
 * the models drop the fence maybe one time in twenty and that is a cheap
 * recovery — and if that fails too the caller gets null and records a coverage
 * note. Prose where JSON was asked for is a degraded run, not a crash.
 */
export function extractJsonBlock(text, schemaName) {
  if (typeof text !== "string" || text.length === 0) return null;

  const candidates = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/g;
  let match;
  while ((match = fenced.exec(text))) candidates.push(match[1]);

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    let parsed;
    try {
      parsed = JSON.parse(candidates[index].trim());
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    if (schemaName && parsed.schema !== schemaName) continue;
    return parsed;
  }
  return null;
}

/** Repo-relative, no traversal, no absolute path. A claim may only cite ours. */
function normaliseRelativePath(root, candidate) {
  if (typeof candidate !== "string" || candidate.trim().length === 0) return null;
  let rel = candidate.trim();
  if (path.isAbsolute(rel)) rel = path.relative(root, rel);
  rel = rel.replace(/^\.\//, "");
  if (rel.startsWith("..") || rel.length === 0) return null;
  return rel;
}

/**
 * The free half of verification.
 *
 * Returns `{ ok: false }` for a citation that cannot be true, with the reason
 * in this layer's own words so the transcript reads as a decision rather than
 * an absence. `evidence` is the source line itself, read here because we have
 * the file open anyway — which is what lets a surviving finding print the
 * offending line the way every static check's finding does.
 */
export function precheckCitation({ root, claim }) {
  const rel = normaliseRelativePath(root, claim?.file);
  if (!rel) {
    return { ok: false, reason: `Claim names no usable repo-relative file (got ${JSON.stringify(claim?.file)}).` };
  }

  const absolute = path.join(root, rel);
  let stat;
  try {
    stat = statSync(absolute);
  } catch {
    return { ok: false, reason: `Cited file ${rel} does not exist in this repository.`, file: rel };
  }
  if (!stat.isFile()) {
    return { ok: false, reason: `Cited path ${rel} is not a file.`, file: rel };
  }

  const line = Number(claim?.line);
  if (!Number.isInteger(line) || line < 1) {
    return { ok: false, reason: `Claim on ${rel} carries no usable line number (got ${JSON.stringify(claim?.line)}).`, file: rel };
  }

  let lines;
  try {
    lines = readFileSync(absolute, "utf8").split(/\r?\n/);
  } catch (error) {
    return { ok: false, reason: `Cited file ${rel} could not be read: ${String(error?.message ?? error)}.`, file: rel };
  }
  if (line > lines.length) {
    return {
      ok: false,
      reason: `Cited line ${rel}:${line} is past the end of the file, which has ${lines.length} line(s).`,
      file: rel,
    };
  }

  return { ok: true, file: rel, line, evidence: lines[line - 1]?.trim() ?? "" };
}

/** The prompt one refuter sees. The claim is quoted; the lens is the variable. */
export function refuterPrompt({ claim, subsystem, lens, evidence }) {
  return [
    `You are refuting a code-review claim about a production school fee-management app.`,
    `You are running with the repository as your working directory and have Read, Grep and Glob over it.`,
    ``,
    `# The claim`,
    ``,
    `Subsystem: ${subsystem?.title ?? subsystem?.id ?? "unknown"}`,
    `Location:  ${claim.file}:${claim.line}`,
    `Line as it exists on disk right now:`,
    `    ${evidence ?? "(empty line)"}`,
    ``,
    `Claim: ${claim.claim}`,
    ``,
    `Failure scenario the reviewer gave: ${claim.failureScenario}`,
    ``,
    `# Your lens: ${lens.title}`,
    ``,
    lens.instruction,
    ``,
    `# How to answer`,
    ``,
    `Your job is to REFUTE. You are not a second reviewer and you do not get credit for`,
    `agreeing. **Default to refuted: true whenever you are not sure.** A claim you cannot`,
    `positively confirm by reading actual code is refuted. Only answer refuted: false if you`,
    `read the code and the claim plainly holds under your lens.`,
    ``,
    `Reply with one fenced JSON block and nothing after it:`,
    ``,
    "```json",
    JSON.stringify(
      {
        schema: REFUTATION_SCHEMA,
        refuted: true,
        reason: "One or two sentences, citing what you read — file:line or a quoted expression.",
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

/** Coerce whatever came back into a vote. Anything unusable votes to refute. */
function readVote(parsed) {
  if (!parsed || typeof parsed.refuted !== "boolean") {
    return { usable: false, refuted: true, reason: "Refuter returned no usable verdict; counted as a refutation." };
  }
  return {
    usable: true,
    refuted: parsed.refuted,
    reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 600) : "(no reason given)",
  };
}

/**
 * Three refuters, in parallel, one claim.
 *
 * `ask` is injected rather than imported so this module never spawns anything
 * itself: the process driver, its timeout and its transcript writing all live
 * in `run.mjs`, and a unit test of the survival arithmetic can hand in a stub.
 *
 * The arithmetic, stated once so it is not re-derived from the code:
 *
 *   - no refuter returned anything usable  → unverified (records as suspected)
 *   - two or more usable not-refuted votes → survives
 *   - exactly one                          → split (records as suspected)
 *   - none                                 → dead
 *
 * A refuter that errored is a refutation for the survival test but is *not*
 * counted as usable, so three dead refuters produce "unverified" rather than a
 * confident kill. Killing a claim because the CLI was rate-limited would be
 * the same lie in the other direction.
 */
export async function verifyClaim({ claim, subsystem, evidence, ask, timeoutMs }) {
  const votes = await Promise.all(
    REFUTER_LENSES.map(async (lens) => {
      const answer = await ask({
        prompt: refuterPrompt({ claim, subsystem, lens, evidence }),
        timeoutMs,
        label: `refute:${subsystem?.id ?? "?"}:${lens.id}`,
      });
      if (!answer.ok) {
        return {
          lens: lens.id,
          usable: false,
          refuted: true,
          reason: `Refuter did not complete (${answer.error}); counted as a refutation.`,
          transcript: answer,
        };
      }
      const vote = readVote(extractJsonBlock(answer.text, REFUTATION_SCHEMA));
      return { lens: lens.id, ...vote, transcript: answer };
    }),
  );

  const usable = votes.filter((vote) => vote.usable);
  const survived = votes.filter((vote) => vote.usable && !vote.refuted);

  let outcome;
  if (usable.length === 0) outcome = "unverified";
  else if (survived.length >= 2) outcome = "survived";
  else if (survived.length === 1) outcome = "split";
  else outcome = "refuted";

  return { outcome, votes, usableCount: usable.length, survivedCount: survived.length };
}
