/**
 * Money, and the four ways this repo can quietly get it wrong.
 *
 * Every rupee here is an integer. Every money column in `supabase/migrations`
 * is `integer`, there is no branded money type, and `parseFloat` does not
 * appear anywhere in the tree. So the failures worth finding are not floating
 * point ones — they are the ones where whole rupees stop adding up, or where
 * two places round the same rupee in two different directions.
 *
 * Four rules, in the order they matter.
 *
 *   1. `scan.money-split-not-conserving` — a total divided by a part count
 *      with `Math.round`, so `n x round(a/n) != a` and the parts no longer sum
 *      to the whole. The repo already knows this and has three remainder-
 *      preserving splitters for it: `splitAmountWithRemainderLast`
 *      (lib/fees/workbook.ts, remainder to the last part),
 *      `splitAcrossInstallments` (lib/fees/generator.ts and
 *      lib/fees/regeneration.ts, remainder to the first) and
 *      `allocateChargesRespectingPaidFloors`. Anywhere the split is written by
 *      hand instead, a family is shown a per-installment breakdown whose rows
 *      do not add to the figure printed above them.
 *
 *   2. `scan.money-round-then-validate` — `Math.round(parsed)` upstream of the
 *      `Number.isInteger(...)` that exists to reject a fractional amount. The
 *      guard cannot fail: rounding already made it an integer. "1500.75" is
 *      accepted and posted as 1501.
 *
 *   3. `scan.money-format-raw` — the grep-ability rule.
 *      `scripts/audit-money-formatting.mjs` already enforces it, but only over
 *      `src/app/`, `src/components/` and `src/ui/`, and only for "Rs." with the
 *      period. This extends it into `src/lib/`, `src/platform/` and `workers/`
 *      (which that script never walks)
 *      and adds the no-period "Rs " spelling everywhere. Same escape hatch,
 *      same allowlist — a rule with two different answers is worse than one
 *      rule with a narrow scope.
 *
 *   4. `scan.rounding-policy-mixed` — heuristic, and honest about it. The
 *      domain core coerces a rupee with `Math.trunc`; a handful of edge
 *      helpers coerce the same quantity with `Math.round`. Today that is
 *      latent, because integers survive both. It stops being latent the first
 *      time a fraction reaches one of them, and then the ledger and the
 *      receipt disagree by a rupee with nothing to explain it.
 *
 * The discipline that shapes all four: `Math.round` in this codebase is mostly
 * about percentages, day counts, pixels and animation frames — roughly forty
 * sites that have nothing to do with money. A rule that fires on those is a
 * rule somebody mutes. So the money rules gate on operand naming and on a
 * narrow list of part-count divisors, and the coverage note says exactly what
 * that buys and what it costs.
 */

export const id = "money";
export const title = "Rupee arithmetic, rounding policy and formatting";

/* ─── shared vocabulary ─────────────────────────────────────────────────── */

/**
 * Words that make an operand a money operand.
 *
 * Matched against the camel-split, lowercased expression, so `dist.tuitionFee`
 * becomes "dist. tuition fee" and matches on both `tuition` and `fee`. This is
 * the gate that keeps the arithmetic rules off `Math.round(elapsedMs / 1000)`
 * and `Math.round((count / total) * 100)`.
 */
const MONEY_WORD =
  /\b(amount|amounts|fee|fees|due|dues|paid|payment|payments|charge|charges|discount|discounts|waiver|waived|total|totals|balance|tuition|transport|pending|collected|outstanding|credit|refund|rupee|rupees|price|academic|money|inr)\b/;

/**
 * Divisors that mean "how many parts is this split into".
 *
 * Deliberately a short exact list rather than a shape. The alternative — any
 * identifier ending in `count` or `length` — sweeps in `receiptCount`,
 * `studentsWithGeneratedDues` and `series.length`, every one of which divides
 * money by a *population* to produce an average that is displayed and never
 * billed. Those are correct code, there are eight of them, and eight false
 * positives on a P1 is how a P1 stops being read.
 */
const PART_COUNT_DIVISOR =
  /^(?:installmentCount|installmentsCount|installmentCnt|count|parts|partCount|splitCount)$|^(?:installment|part)[A-Za-z]*\.length$/;

/** Names that say "this variable is a fraction of a whole", e.g. `proratedShare`. */
const RATIO_NAME = /(share|ratio|fraction|proportion|prorat|factor)/i;

/** Rounding that can lose a rupee upward or downward. */
const ROUNDERS = ["Math.round", "Math.ceil", "Math.floor"];

/** The same, plus the house whole-rupee coercer, for the policy comparison. */
const COERCERS = ["Math.round", "Math.trunc", "Math.floor"];

/**
 * Remainder handling, in any of the spellings the three real splitters use.
 * Seeing one of these near a division means the author already thought about
 * the leftover rupee, and the split is not the bug.
 */
const REMAINDER_HANDLING =
  /\bremainder\b|%\s*(?:count|installmentCount|normalizedCount|parts)\b|-\s*[A-Za-z_$][\w$]*\s*\*\s*\(/;

function camelWords(text) {
  return String(text)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .toLowerCase();
}

function isMoneyExpression(text) {
  return MONEY_WORD.test(camelWords(text));
}

/**
 * Comment-blanked lines, same length and same count as `file.lines`.
 *
 * Every rule below reads these instead of the raw text, because this repo
 * comments heavily and in money vocabulary — `src/lib/fees/generator.ts:536` says
 * `the receipt said "Rs 3,100 received"` in prose, and a formatting rule that
 * cannot tell prose from a template literal reports it forever. A `//` inside
 * a string literal is blanked too, which costs a false negative and never a
 * false positive; that is the right direction to be wrong in here.
 */
function codeLines(file) {
  const out = [];
  let inBlock = false;
  for (const raw of file.lines) {
    let line = raw;
    if (inBlock) {
      const close = line.indexOf("*" + "/");
      if (close === -1) {
        out.push("");
        continue;
      }
      line = " ".repeat(close + 2) + line.slice(close + 2);
      inBlock = false;
    }
    // Strip a line comment, then any complete block comment, then note an open one.
    const lineComment = line.indexOf("//");
    if (lineComment !== -1) line = line.slice(0, lineComment);
    line = line.replace(/\/\*[\s\S]*?\*\//g, " ");
    const open = line.indexOf("/*");
    if (open !== -1) {
      line = line.slice(0, open);
      inBlock = true;
    }
    out.push(line);
  }
  return out;
}

/** The argument text of `callee(` starting at `open`, paren-balanced. */
function argumentAt(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return { body: text.slice(open + 1, i), end: i };
    }
  }
  return null;
}

/** Split on the first top-level occurrence of `op`. Null when there is none. */
function splitTopLevel(text, op) {
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (depth === 0 && ch === op) {
      return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
    }
  }
  return null;
}

/** Every rounding call in one line, with its paren-balanced argument. */
function roundingCallsIn(line, callees = ROUNDERS) {
  const found = [];
  for (const rounder of callees) {
    let from = 0;
    for (;;) {
      const at = line.indexOf(`${rounder}(`, from);
      if (at === -1) break;
      const arg = argumentAt(line, at + rounder.length);
      if (arg) found.push({ rounder, arg: arg.body });
      from = at + rounder.length;
    }
  }
  return found;
}

/* ─── 1. splits that do not conserve ────────────────────────────────────── */

/**
 * `Math.round(total / installmentCount)`, and the two-step version where the
 * quotient is stashed in a `…Share` variable first and each head is then
 * multiplied by it. The second shape is the worse one: four independent
 * roundings of four heads against one ratio, so the drift compounds.
 */
function findSplits(file, code) {
  const direct = [];
  const ratioVariables = new Map();

  for (let index = 0; index < code.length; index += 1) {
    const line = code[index];
    if (!line.includes("/")) continue;

    // Shape B, first half: `const proratedShare = <anything> / <partCount>;`
    const ratio = line.match(
      /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+?)\s*\/\s*([A-Za-z_$][\w$.]*)\s*;/,
    );
    if (ratio && RATIO_NAME.test(ratio[1]) && PART_COUNT_DIVISOR.test(ratio[3])) {
      ratioVariables.set(ratio[1], { line: index + 1, divisor: ratio[3] });
    }

    // Shape A: the division sits inside the rounding call itself.
    for (const call of roundingCallsIn(line)) {
      const halves = splitTopLevel(call.arg, "/");
      if (!halves) continue;
      const [numerator, denominator] = halves;
      if (!PART_COUNT_DIVISOR.test(denominator)) continue;
      if (!isMoneyExpression(numerator)) continue;
      // `(a / n) * 100` is a percentage, never a split.
      if (/\*\s*100\b|\b100\s*\*/.test(call.arg) || /\*\s*100\b/.test(line)) continue;

      // The three real splitters all divide with Math.floor and then hand the
      // leftover rupee to one part. Look for that before accusing anybody.
      const window = code.slice(Math.max(0, index - 6), index + 9).join("\n");
      if (REMAINDER_HANDLING.test(window)) continue;

      direct.push({ line: index + 1, divisor: denominator, numerator, rounder: call.rounder });
    }
  }

  // Shape B, second half: `Math.round(<money> * proratedShare)`.
  const viaRatio = [];
  if (ratioVariables.size > 0) {
    for (let index = 0; index < code.length; index += 1) {
      for (const call of roundingCallsIn(code[index])) {
        const halves = splitTopLevel(call.arg, "*");
        if (!halves) continue;
        const [left, right] = halves;
        const name = ratioVariables.has(right) ? right : ratioVariables.has(left) ? left : null;
        if (!name) continue;
        const money = name === right ? left : right;
        if (!isMoneyExpression(money)) continue;
        viaRatio.push({ line: index + 1, ratio: name, money, rounder: call.rounder });
      }
    }
  }

  return { direct, viaRatio, ratioVariables };
}

/* ─── 2. rounded before it was validated ────────────────────────────────── */

/** The body of `name`'s declaration, as `{ startLine, endLine }`, or null. */
function functionBody(code, name) {
  const declaration = new RegExp(
    `(?:^|\\s)(?:async\\s+)?function\\s+${name}\\s*\\(|(?:const|let)\\s+${name}\\s*=\\s*(?:async\\s*)?\\(`,
  );
  for (let index = 0; index < code.length; index += 1) {
    if (!declaration.test(code[index])) continue;
    let depth = 0;
    let opened = false;
    for (let cursor = index; cursor < Math.min(code.length, index + 40); cursor += 1) {
      for (const ch of code[cursor]) {
        if (ch === "{") {
          depth += 1;
          opened = true;
        } else if (ch === "}") depth -= 1;
      }
      if (opened && depth <= 0) return { startLine: index, endLine: cursor };
    }
    return { startLine: index, endLine: Math.min(code.length - 1, index + 40) };
  }
  return null;
}

function findRoundThenValidate(file, code) {
  const findings = [];

  for (let index = 0; index < code.length; index += 1) {
    const line = code[index];
    const guard = line.match(/Number\.isInteger\(\s*([A-Za-z_$][\w$]*)\s*\)/);
    if (!guard) continue;
    const subject = guard[1];

    // Where did the value come from? Only a direct local call is followed —
    // an identifier that arrives as a parameter is somebody else's contract.
    const assignment = new RegExp(
      `(?:const|let)\\s+${subject}\\s*=\\s*([A-Za-z_$][\\w$]*)\\s*\\(`,
    );
    let producer = null;
    for (const candidate of code) {
      const match = candidate.match(assignment);
      if (match) {
        producer = match[1];
        break;
      }
    }
    if (!producer) continue;

    const body = functionBody(code, producer);
    if (!body) continue;

    const bodyText = code.slice(body.startLine, body.endLine + 1).join("\n");
    // It must actually parse something. `Math.round` over a value that was
    // already a number is a different (and much weaker) complaint.
    if (!/\bNumber\s*\(|\bparseInt\s*\(|\bparseFloat\s*\(/.test(bodyText)) continue;

    for (let cursor = body.startLine; cursor <= body.endLine; cursor += 1) {
      const rounding = code[cursor].match(/(Math\.(?:round|ceil|floor|trunc))\(/);
      if (!rounding) continue;
      findings.push({
        line: cursor + 1,
        rounder: rounding[1],
        producer,
        subject,
        guardLine: index + 1,
      });
      break;
    }
  }

  return findings;
}

/* ─── 3. raw money formatting ───────────────────────────────────────────── */

/**
 * The audit script's own allowlist, plus one addition.
 *
 * `workers/schoolfees-mcp/src/format.mjs` *is* the worker's currency helper.
 * The MCP worker is a separate Cloudflare bundle that cannot import from
 * `src/lib/`, so its formatter is a deliberate mirror rather than a bypass — the
 * same relationship `docs/modules/mcp-server.md` describes for
 * `src/permissions.mjs` and `src/platform/auth/roles.ts`.
 */
const FORMAT_ALLOWLIST = new Set([
  "src/platform/helpers/currency.ts",
  "src/ui/primitives/money.tsx",
  "src/ui/primitives/money-with-definition.tsx",
  "src/ui/primitives/money-glossary.tsx",
  "workers/schoolfees-mcp/src/format.mjs",
]);

/**
 * The half of the tree `scripts/audit-money-formatting.mjs` does NOT walk.
 * That script owns `src/app`, `src/components` and `src/ui`; this sweeps the
 * rest for the same four patterns. Reporting a violation the repo's own CI
 * script reports would mean two failure messages for one line and two places
 * to add the same exception.
 *
 * Keep this in step with SCAN_DIRS in that script — the two are complements,
 * and the failure is silent in both directions: overlap double-reports, and a
 * gap means nobody looks at all. `modules` is listed ahead of the feature-first
 * split so the domain code stays covered the day it moves there.
 */
const AUDIT_BLIND_SPOT = /^(?:src\/(?:lib|platform|modules|messages)|workers)\//;

const FORMAT_PATTERNS = [
  {
    name: "toLocaleString(\"en-IN\")",
    pattern: /toLocaleString\(\s*["']en-IN["']/,
    auditOwns: true,
  },
  {
    name: "new Intl.NumberFormat(\"en-IN\")",
    pattern: /new\s+Intl\.NumberFormat\(\s*["']en-IN["']/,
    auditOwns: true,
  },
  { name: "a hand-written ₹ glyph", pattern: /["'`]₹|₹\$\{/, auditOwns: true },
  { name: "a hand-written \"Rs.\" literal", pattern: /Rs\.\s*(?:\$\{|\d)/, auditOwns: true },
  {
    // The spelling the audit's own regex misses: it requires the period.
    name: "a hand-written \"Rs\" literal with no period",
    pattern: /\bRs\s+(?:\$\{|\d)/,
    auditOwns: false,
  },
];

/* ─── 4. two rounding policies for one rupee ────────────────────────────── */

/** Quantities that are not money however they are spelled. */
const NON_MONEY_TAIL =
  /(ms|pct|percent|percentage|rate|ratio|index|score|progress|seconds|minutes|hours|days|width|height|opacity|count|length|size|frame|scroll|offset|version|year|month|day)$/i;

/** Peel `Math.max(x, 0)`, `x ?? 0`, `x || 0` off a coercion to reach the value. */
function coercedOperand(argument) {
  let text = argument.trim();
  const wrapper = text.match(/^(?:Math\.(?:max|min)\()?\s*([^,]+?)\s*(?:,\s*-?\d+\s*\))?$/);
  if (wrapper) text = wrapper[1].trim();
  text = text.replace(/\s*(?:\|\||\?\?)\s*-?\d+\s*$/, "").trim();
  if (!/^[A-Za-z_$][\w$.?]*$/.test(text)) return null;
  const tail = text.split(".").pop().replace(/\?$/, "");
  return tail || null;
}

function findCoercions(file, code) {
  const out = [];
  for (let index = 0; index < code.length; index += 1) {
    const line = code[index];
    if (/[%]/.test(line)) continue;
    for (const call of roundingCallsIn(line, COERCERS)) {
      // A coercion has exactly one value in it — no arithmetic at all.
      if (/[+\-*/]/.test(call.arg)) continue;
      const operand = coercedOperand(call.arg);
      if (!operand) continue;
      out.push({ file: file.rel, line: index + 1, rounder: call.rounder, operand });
    }
  }
  return out;
}

/* ─── the check ─────────────────────────────────────────────────────────── */

export async function run({ project, sink, coverage }) {
  const files = project.product.filter(
    (file) => !file.isTest && !file.isScript && !file.rel.startsWith("tests/"),
  );

  const codeByRel = new Map();
  for (const file of files) codeByRel.set(file.rel, codeLines(file));

  let examined = 0;
  /** Lines already claimed by the P1 rule, so the P2 heuristic stays off them. */
  const claimed = new Set();
  /** Every `Math.trunc(x)` coercion, keyed by the value's base name. */
  const truncByOperand = new Map();
  const roundCoercions = [];

  for (const file of files) {
    examined += 1;
    const code = codeByRel.get(file.rel);

    /* 2. rounded, then "validated" ---------------------------------------- */
    for (const hit of findRoundThenValidate(file, code)) {
      claimed.add(`${file.rel}:${hit.line}`);
      sink.record({
        rule: "scan.money-round-then-validate",
        file: file.rel,
        line: hit.line,
        title: `${file.rel}:${hit.line} rounds the amount before Number.isInteger can reject it`,
        expected:
          "A fractional rupee entered on a form is refused, because every money column in "
          + "supabase/migrations is `integer` and the ledger has no way to hold the paise.",
        actual:
          `${hit.producer}() applies ${hit.rounder} to the parsed value, and line ${hit.guardLine} `
          + `then tests \`Number.isInteger(${hit.subject})\`. That test can never fail — `
          + `${hit.rounder} has already made it an integer — so "1500.75" is silently accepted `
          + "and posted as 1501.",
        evidence: file.lines[hit.line - 1],
        why:
          "The guard reads like input validation and is dead code. A parent handed a receipt for "
          + "a rupee more than they paid has no way to see where it came from, and the ledger "
          + "carries a figure nobody typed.",
        fix:
          `Drop the ${hit.rounder} from ${hit.producer}() and let Number.isInteger do the job it `
          + "was written for — the shape already used by parsePaymentAmount in "
          + "src/app/protected/payments/actions.ts and parseAmount in "
          + "src/app/protected/ledger/actions.ts, both of which validate the raw Number().",
      });
    }

    /* 1. splits that stop summing to the whole ---------------------------- */
    const { direct, viaRatio, ratioVariables } = findSplits(file, code);

    const byDivisor = new Map();
    for (const hit of direct) {
      if (!byDivisor.has(hit.divisor)) byDivisor.set(hit.divisor, []);
      byDivisor.get(hit.divisor).push(hit);
    }
    for (const [divisor, hits] of byDivisor) {
      const first = hits[0];
      const lines = hits.map((hit) => hit.line).join(", ");
      sink.record({
        rule: "scan.money-split-not-conserving",
        file: file.rel,
        line: first.line,
        title: `${file.rel} splits money by ${divisor} without preserving the remainder`,
        expected:
          "A rupee total divided into parts is split by a remainder-preserving splitter, so the "
          + "parts sum back to the total: splitAmountWithRemainderLast (lib/fees/workbook.ts) "
          + "sends the leftover to the last part, splitAcrossInstallments (lib/fees/generator.ts) "
          + "to the first.",
        actual:
          `${hits.length === 1 ? "Line" : "Lines"} ${lines} compute `
          + `${first.rounder}(${first.numerator} / ${divisor}) independently per part. `
          + `${divisor} x ${first.rounder}(total / ${divisor}) does not equal total whenever the `
          + "division leaves a remainder: a Rs 19,502 head over 4 installments renders as "
          + "4 x Rs 4,876 = Rs 19,504, two rupees more than the head it was split from.",
        evidence: file.lines[first.line - 1],
        why:
          "This is the per-installment breakdown a parent is shown. Rows that do not add to the "
          + "total printed beside them are the kind of discrepancy the office cannot explain at "
          + "the counter, and the workbook engine itself never produces them.",
        fix:
          "Call splitAmountWithRemainderLast(total, "
          + `${divisor}) and index into the result, instead of rounding each part separately.`,
      });
    }

    const byRatio = new Map();
    for (const hit of viaRatio) {
      if (!byRatio.has(hit.ratio)) byRatio.set(hit.ratio, []);
      byRatio.get(hit.ratio).push(hit);
    }
    for (const [name, hits] of byRatio) {
      const source = ratioVariables.get(name);
      const first = hits[0];
      const lines = hits.map((hit) => hit.line).join(", ");
      sink.record({
        rule: "scan.money-split-not-conserving",
        file: file.rel,
        line: first.line,
        title: `${file.rel} prorates ${hits.length} money heads through \`${name}\` and rounds each one separately`,
        expected:
          "Prorating a total across a subset of installments produces parts that still sum to the "
          + "prorated total — the same guarantee splitAmountWithRemainderLast gives.",
        actual:
          `\`${name}\` is defined on line ${source.line} as a fraction over ${source.divisor}, and `
          + `${hits.length} head${hits.length === 1 ? "" : "s"} on line${hits.length === 1 ? "" : "s"} `
          + `${lines} are each rounded independently against it (${first.rounder}(${first.money} * ${name})). `
          + "Independent roundings of one ratio compound: the head rows can miss the overdue total "
          + "shown above them by a rupee per head, in either direction.",
        evidence: file.lines[first.line - 1],
        why:
          "This is the overdue breakdown on the Payment Desk's mobile flow — the figure a cashier "
          + "reads out loud while a parent is standing there. The heads and the amount being "
          + "collected have to agree.",
        fix:
          "Derive the prorated heads from the installment charges the workbook engine already "
          + "produced (buildWorkbookInstallmentCharges in lib/fees/workbook.ts) and sum them, "
          + "rather than scaling annual heads by a ratio at render time.",
      });
    }

    /* 3. raw money formatting --------------------------------------------- */
    if (!FORMAT_ALLOWLIST.has(file.rel)) {
      const inAuditBlindSpot = AUDIT_BLIND_SPOT.test(file.rel);
      for (let index = 0; index < code.length; index += 1) {
        const raw = file.lines[index];
        if (raw.includes("@allow-raw-money-format")) continue;
        const line = code[index];
        if (!line.trim()) continue;
        let reported = false;
        for (const rule of FORMAT_PATTERNS) {
          if (reported) break;
          if (rule.auditOwns && !inAuditBlindSpot) continue;
          if (!rule.pattern.test(line)) continue;
          // One line, one finding. `Rs. ${x.toLocaleString("en-IN")}` trips two
          // patterns and is one mistake with one fix.
          reported = true;
          // `MAX_IMPORT_ROWS.toLocaleString("en-IN")` breaks the same rule for
          // the same reason, but calling a row count a rupee figure is the kind
          // of small inaccuracy that gets a whole finding dismissed.
          const isRupees = /₹|\bRs\b/.test(line) || isMoneyExpression(line);
          const subject = isRupees ? "a rupee figure" : "an en-IN number";
          sink.record({
            rule: "scan.money-format-raw",
            file: file.rel,
            line: index + 1,
            title: `${file.rel}:${index + 1} formats ${subject} without lib/helpers/currency.ts`,
            expected:
              "Every rupee a person reads is produced by formatInr() or <Money />, and every other "
              + "en-IN grouped number by the plain formatter beside it, so a find-references on "
              + "src/platform/helpers/currency.ts reaches every one of them.",
            actual:
              `This line uses ${rule.name} directly.`
              + (rule.auditOwns
                ? ` scripts/audit-money-formatting.mjs enforces the same rule, but only walks app/`
                  + ` and components/ — it never reads ${file.rel.split("/")[0]}/.`
                : " scripts/audit-money-formatting.mjs matches only \"Rs.\" with the period"
                  + " (/[\"'`]Rs\\.\\s*\\d|>\\s*Rs\\.\\s/), so this spelling passes CI today."),
            evidence: raw,
            why:
              "The point of the rule is grep-ability, not aesthetics: null, zero, sign, paise and "
              + "the symbol are decided once in formatInr. A second formatter is a second set of "
              + "answers, and nobody finds it when the first one changes.",
            fix:
              "Use formatInr() (or <Money /> in JSX). If the divergence is deliberate — react-pdf's "
              + "Helvetica genuinely has no ₹ glyph — put the reason on the line with "
              + "`// @allow-raw-money-format`, which both this check and the audit script honour.",
          });
        }
      }
    }

    /* 4. gather coercions for the cross-file rounding-policy comparison ---- */
    for (const hit of findCoercions(file, code)) {
      if (file.rel === "src/platform/helpers/currency.ts") continue;
      if (hit.rounder === "Math.trunc") {
        if (!truncByOperand.has(hit.operand)) truncByOperand.set(hit.operand, []);
        truncByOperand.get(hit.operand).push(hit);
      } else if (hit.rounder === "Math.round") {
        roundCoercions.push(hit);
      }
    }
  }

  /* 4. two policies, one quantity ----------------------------------------- */
  for (const hit of roundCoercions) {
    if (claimed.has(`${hit.file}:${hit.line}`)) continue;
    if (NON_MONEY_TAIL.test(hit.operand)) continue;
    const twins = truncByOperand.get(hit.operand);
    if (!twins || twins.length === 0) continue;

    // The operand alone can be as generic as `value`, which is exactly what the
    // house whole-rupee coercers are called. Confirm from the neighbourhood
    // that this really is a rupee before saying so.
    const file = project.get(hit.file);
    const code = codeByRel.get(hit.file);
    const window = code.slice(Math.max(0, hit.line - 11), hit.line + 10).join("\n");
    if (!isMoneyExpression(window) && !/₹|\bRs\b/.test(window)) continue;

    const sample = twins.slice(0, 3).map((twin) => `${twin.file}:${twin.line}`).join(", ");
    sink.record({
      rule: "scan.rounding-policy-mixed",
      file: hit.file,
      line: hit.line,
      title: `${hit.file}:${hit.line} rounds \`${hit.operand}\` where the domain core truncates it`,
      expected:
        "One rounding policy per rupee. The domain core coerces a money value to whole rupees "
        + "with Math.trunc — lib/fees/due-amounts.ts, lib/receipts/amounts.ts, "
        + "src/lib/finance/financial-state.ts and lib/payments/allocation.ts all do — so a figure "
        + "reaches the ledger, the receipt and the export with the same value.",
      actual:
        `This coerces \`${hit.operand}\` with Math.round, while ${twins.length} other site`
        + `${twins.length === 1 ? "" : "s"} coerce the same-named quantity with Math.trunc `
        + `(${sample}). For 1500.6 one answers 1501 and the other 1500.`,
      evidence: file.lines[hit.line - 1],
      why:
        "Latent today and not later: every money column in supabase/migrations is `integer`, so "
        + "both policies agree on everything currently in the database. The first fractional "
        + "value that reaches one of these — an imported spreadsheet, a percentage discount, a "
        + "future decimal column — makes the receipt and the ledger differ by a rupee, with "
        + "nothing in either to say which is right.",
      fix:
        "Use Math.trunc here too, or state in a comment why this surface deliberately rounds up "
        + "and the ledger does not.",
    });
  }

  coverage.declare({
    check: id,
    dimension: "product source files (app, components, lib, workers, hooks, i18n; no tests, no scripts)",
    domainSize: files.length,
    examined,
    strategy: "exhaustive",
    note:
      "Every product file is read, but the money rules are deliberately narrow inside it. "
      + "(1) The split rule fires only when the divisor is literally installmentCount, count, "
      + "parts, or an installment-/part-named `.length`, and only when the numerator carries a "
      + "money word. Dividing money by a *population* — receiptCount, series.length, "
      + "studentsWithGeneratedDues — is how this repo computes displayed averages, there are "
      + "eight of them and they are correct; separating them by divisor name is the only rule "
      + "that reliably keeps them out. A split written with a divisor named something else is "
      + "invisible to this check. (2) The same money-word gate keeps all four rules off the "
      + "roughly forty Math.round calls in the tree that count percentages, days, pixels, "
      + "milliseconds and animation frames — and it means a money variable named neutrally "
      + "(`v`, `x`, `n`) is not seen either. (3) A division is treated as safe when remainder "
      + "handling appears within six lines above or eight below, which is how the three real "
      + "splitters are written; a splitter that keeps its remainder logic further away reads as "
      + "a finding. (4) scan.money-format-raw runs the audit script's own four patterns only "
      + "over lib/, workers/, hooks/, utils/ and i18n/, which that script never walks; across "
      + "the whole tree it adds the no-period \"Rs \" spelling its regex misses. "
      + "Intl.DateTimeFormat is not reported at all — it is a date, not money, and "
      + "src/platform/helpers/date.ts is its canonical home. (5) scan.rounding-policy-mixed is heuristic "
      + "by registration: it matches on the coerced value's base name, so it sees "
      + "Math.round(value) against Math.trunc(value) and cannot see the same quantity coerced "
      + "under two different names. Comments are blanked before any rule reads a line, which "
      + "also blanks `//` inside string literals — a false negative, never a false positive.",
  });
}
