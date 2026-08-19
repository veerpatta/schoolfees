/**
 * The scan report, and its verdict.
 *
 * Deliberately the same document shape as `tests/deep/report/render.mjs`, and
 * deliberately using the same `evaluateGate` — a P0 is a P0 whether a browser
 * found it or a parser did, and two severity policies in one repo is how one
 * of them quietly stops being enforced.
 *
 * The one structural borrowing worth stating: **coverage comes before
 * findings.** A static scan is even easier to misread than a browser sweep,
 * because a check that threw on its first file produces the same silence as a
 * check that swept 1,100 files and found nothing. The table at the top is what
 * tells those apart.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { evaluateGate, proposeNoiseBudget, EMPTY_BASELINE } from "../../deep/report/gate.mjs";
import { SEVERITY_ORDER } from "../../deep/lib/rules.mjs";

const BASELINE_PATH = "tests/scan/baseline/known-findings.json";

export function loadBaseline(root) {
  const full = path.join(root, BASELINE_PATH);
  if (!existsSync(full)) return EMPTY_BASELINE;
  try {
    return JSON.parse(readFileSync(full, "utf8"));
  } catch {
    return EMPTY_BASELINE;
  }
}

export function writeBaseline(root, findings, baseline) {
  const full = path.join(root, BASELINE_PATH);
  mkdirSync(path.dirname(full), { recursive: true });
  const proposed = {
    generatedAt: new Date().toISOString(),
    _comment: [
      "The noise budget and the waiver list for tests/scan.",
      "",
      "Same policy as tests/deep/baseline/known-findings.json, same gate code:",
      "P0 always fails; deterministic P1 fails; P2/P3 fail only when the count",
      "for a rule exceeds the budget here. That is what lets a hard gate run",
      "today against a repo that already carries 59 dead exports — 60 fails and",
      "names only the new one.",
      "",
      "A waiver needs an owner and an expiresOn. An expired waiver fails the run",
      "by itself, so nothing here can mute a finding forever by being forgotten.",
      "",
      "Regenerate from a clean run with:  npm run scan -- --write-baseline",
    ],
    waivers: baseline?.waivers ?? [],
    noiseBudget: proposeNoiseBudget(findings),
  };
  writeFileSync(full, `${JSON.stringify(proposed, null, 2)}\n`, "utf8");
  return full;
}

function severityCounts(findings) {
  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

/**
 * @param {object} input
 * @param {string} input.runId
 * @param {object} input.manifest    what ran, against what tree
 * @param {object[]} input.findings
 * @param {object} input.coverage    ScanCoverage#toJSON()
 * @param {object} input.baseline
 * @param {boolean} input.strict
 */
export function renderScanReport({ runId, manifest, findings, coverage, baseline, strict }) {
  const sorted = [...findings].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.confidence !== b.confidence) return a.confidence === "deterministic" ? -1 : 1;
    return String(a.surface).localeCompare(String(b.surface));
  });

  const verdict = evaluateGate(sorted, baseline, { strict });

  // A check that threw did not "pass". Its part of the app is unscanned, and
  // the report must not be able to claim otherwise.
  for (const entry of coverage.entries) {
    if (!entry.errored) continue;
    verdict.pass = false;
    verdict.reasons.push(
      `Check "${entry.check}" threw and contributed nothing — that surface is unscanned, not clean.`,
    );
  }

  const counts = severityCounts(sorted);
  const lines = [];
  const push = (line = "") => lines.push(line);

  push(`# Source scan ${runId}`);
  push();
  push(
    `**${verdict.pass ? "PASS" : "FAIL"}** · ${sorted.length} finding(s) · `
      + `P0 ${counts.P0} · P1 ${counts.P1} · P2 ${counts.P2} · P3 ${counts.P3}`,
  );
  push();

  push("## Run");
  push();
  push("| | |");
  push("|---|---|");
  push(`| Run id | \`${runId}\` |`);
  push(`| Layers | ${manifest.layers.join(", ")} |`);
  push(`| Git | \`${manifest.git.sha.slice(0, 12)}\` on ${manifest.git.branch}${manifest.git.dirty ? " (dirty)" : ""} |`);
  push(`| Node | ${manifest.node} |`);
  push(`| Files read | ${manifest.fileCount} |`);
  push(`| Started | ${manifest.startedAt} |`);
  push(`| Duration | ${manifest.durationMs} ms |`);
  push(`| Strict gate | ${strict ? "yes" : "no"} |`);
  push();

  push("## Verdict");
  push();
  if (verdict.pass) {
    push(
      "The gate passed. P0 always fails; deterministic P1 fails; P2/P3 fail only on count "
        + "regression against `tests/scan/baseline/known-findings.json`.",
    );
  } else {
    push(`The gate **failed** for ${verdict.reasons.length} reason(s):`);
    push();
    for (const reason of verdict.reasons) push(`- ${reason}`);
  }
  if (verdict.waivedIds.length > 0) {
    push();
    push(`${verdict.waivedIds.length} finding(s) matched a live waiver.`);
  }
  if (verdict.resolvedWaiverIds.length > 0) {
    push();
    push(
      `**${verdict.resolvedWaiverIds.length} waived finding(s) did not reproduce** — fixed. `
        + `Remove their waivers: ${verdict.resolvedWaiverIds.join(", ")}.`,
    );
  }
  push();

  push("## What this scan did NOT look at");
  push();
  push(coverage.statement);
  push();
  push("| Check | Dimension | Domain | Examined | Strategy |");
  push("|---|---|---:|---:|---|");
  for (const entry of coverage.entries) {
    push(
      `| \`${entry.check}\` | ${entry.dimension} | ${entry.domainSize} | ${entry.examined} | `
        + `${entry.errored ? "**errored**" : entry.strategy} |`,
    );
  }
  push();
  for (const entry of coverage.entries) {
    if (entry.note) push(`- **${entry.check}** — ${entry.note}`);
  }
  push();

  push("## Findings");
  push();
  if (sorted.length === 0) {
    push("None recorded.");
  } else {
    let index = 0;
    for (const finding of sorted) {
      index += 1;
      push(`### ${finding.severity}-${String(index).padStart(3, "0")} ${finding.title}`);
      push();
      push("```");
      push(`id:         ${finding.id}`);
      push(`rule:       ${finding.rule}  [${finding.confidence}]  layer: ${finding.target}`);
      push(`surface:    ${finding.surface}${finding.seenCount > 1 ? `     seen: ${finding.seenCount}×` : ""}`);
      push(`expected:   ${finding.expected}`);
      push(`actual:     ${String(finding.actual).split("\n").join("\n            ")}`);
      if (finding.evidence?.consoleTail?.length) push(`source:     ${finding.evidence.consoleTail[0]}`);
      if (finding.variants?.length) {
        // The distinct inputs that reach one defect. "reached by: empty-body,
        // nul-byte, 5mb-body" is the difference between "any request breaks
        // this" and "only the two with a NUL byte do", and that difference is
        // usually the diagnosis.
        push(
          `reached by:  ${finding.variants.join(", ")}`
            + (finding.variantsTruncated ? ` … (+${finding.seenCount - finding.variants.length} more)` : ""),
        );
      }
      if (finding.why) push(`why:        ${String(finding.why).split("\n").join("\n            ")}`);
      if (finding.fix) push(`fix:        ${String(finding.fix).split("\n").join("\n            ")}`);
      push("```");
      push();
    }
  }

  push("## Rule index");
  push();
  push("| Rule | Severity | Count |");
  push("|---|---|---:|");
  const byRule = new Map();
  for (const finding of sorted) {
    if (!byRule.has(finding.rule)) byRule.set(finding.rule, { severity: finding.severity, count: 0 });
    byRule.get(finding.rule).count += 1;
  }
  for (const [rule, info] of [...byRule].sort(
    (a, b) => SEVERITY_ORDER[a[1].severity] - SEVERITY_ORDER[b[1].severity] || b[1].count - a[1].count,
  )) {
    const budget = baseline?.noiseBudget?.[rule];
    push(`| \`${rule}\` | ${info.severity} | ${info.count}${budget === undefined ? "" : ` / ${budget}`} |`);
  }
  push();
  push(
    "_A `count / budget` cell is a P2 or P3 rule measured against the committed baseline. "
      + "It fails only when the count exceeds the budget._",
  );
  push();

  return { markdown: `${lines.join("\n")}\n`, verdict, counts, findings: sorted };
}
