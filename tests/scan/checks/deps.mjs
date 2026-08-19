/**
 * What the dependency tree already knows is wrong with it.
 *
 * Every other check in this directory reads source. This one shells out, and
 * that difference is most of its design. `npm audit` is the only component of
 * the scan that needs a network, a working npm, and a registry that answers —
 * so it is also the only component that can fail for reasons that have nothing
 * to do with this repository.
 *
 * **A check that cannot run must say so, not say nothing.** An empty findings
 * list from a check that never reached the registry is indistinguishable from
 * a clean tree, and it is the more comforting of the two readings, which is
 * why it is the dangerous one. Every failure path below — npm missing, offline,
 * timed out, a lockfile npm refuses to audit, output that is not JSON, a report
 * version this file does not understand — ends at the same
 * `coverage.declare(...)` with a note that names the reason. Nothing throws.
 * The runner would catch a throw and record `errored`, which is honest too, but
 * losing the structural findings below along with it is not.
 *
 * **A non-zero exit is the normal case.** `npm audit` exits 1 whenever it finds
 * anything at all. Treating that as an error would mean the check only ever
 * succeeded on a clean tree — the one case where it has nothing to report. The
 * exit code is ignored entirely; the JSON on stdout is what decides.
 *
 * Two decisions about what gets a finding:
 *
 * **One finding per advisory, filed against the package the flaw lives in.**
 * `npm audit` reports a package as vulnerable when any of its dependencies is,
 * so a single advisory in `brace-expansion` surfaces as five entries —
 * `brace-expansion`, `minimatch`, and three `eslint` packages — with the four
 * downstream ones carrying no advisory of their own, only the name of what
 * they pulled in. Reporting all five would be reporting one problem five
 * times. So the check walks every `via` array, keeps the entries that are
 * actual advisories, and files against the package named in the advisory —
 * then lists the dependents npm marked vulnerable because of it, since those
 * are the versions a person actually bumps.
 *
 * **Moderate and low are counted, not filed.** `scan.dependency-vulnerable` is
 * P1 and gates. A tree this size always has a handful of moderate advisories
 * in build tooling, and a gating rule that fires on all of them is a gating
 * rule somebody turns off. The count goes in the coverage note, where it is
 * visible and does not block a deploy.
 *
 * The structural half of this check does not need the network at all: a
 * dependency specified as a URL tarball is invisible to `npm audit`, because
 * there is no registry entry to look up and no version to compare a range
 * against. That is a `scan.config-risk`, it is read straight out of
 * `package.json`, and it is emitted even when the audit itself could not run —
 * so this check contributes something offline.
 */

import { spawnSync } from "node:child_process";

export const id = "deps";
export const title = "Known-vulnerable dependencies";

/** Generous: a cold registry lookup over a school network is not a failure. */
const AUDIT_TIMEOUT_MS = 180_000;

/** The report can be several MB on a tree this size. */
const AUDIT_MAX_BUFFER = 64 * 1024 * 1024;

const GATING_SEVERITIES = new Set(["high", "critical"]);

/** Specifiers npm audit cannot evaluate, because they name no registry version. */
const OPAQUE_SPECIFIER = /^(?:https?:|git(?:\+\w+)?:|file:|github:|[\w-]+\/[\w.-]+$)/;

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

/**
 * Windows needs a shell here, and that is not a preference.
 *
 * `npm` on Windows is `npm.cmd`, a batch file, and since the CVE-2024-27980
 * fix Node refuses to spawn one without a shell — `spawnSync` returns EINVAL
 * rather than running it. The first Windows run of this check reported "npm
 * audit failed to run: spawnSync npm.cmd EINVAL" and, correctly, declared
 * itself unscanned; the honest degradation worked, but nothing was audited.
 *
 * `shell: true` reintroduces the argument-quoting problem that CVE fixed, so
 * it is confined to a fixed argv this file writes — "audit", "--json", and at
 * most "--omit=dev". No path, no package name, nothing derived from the
 * repository reaches this command line.
 */
const NEEDS_SHELL = process.platform === "win32";

/**
 * Run `npm audit --json` and return a parsed report or a stated reason.
 *
 * Never throws. Every branch returns `{ ok, report, reason }`, and `reason` is
 * written to be read by somebody looking at the coverage table months later
 * wondering whether the dependency check was actually doing anything.
 */
function runAudit(root, extraArgs = []) {
  let result;
  try {
    result = spawnSync(NPM, ["audit", "--json", ...extraArgs], {
      cwd: root,
      encoding: "utf8",
      timeout: AUDIT_TIMEOUT_MS,
      maxBuffer: AUDIT_MAX_BUFFER,
      shell: NEEDS_SHELL,
      env: process.env,
    });
  } catch (error) {
    return { ok: false, reason: `spawning npm threw: ${String(error?.message ?? error)}` };
  }

  if (result.error) {
    const code = result.error.code;
    if (code === "ENOENT") {
      return { ok: false, reason: `npm is not on PATH (tried "${NPM}")` };
    }
    if (code === "EINVAL") {
      // Should be unreachable now that NEEDS_SHELL is set, but named anyway:
      // this is what the failure looked like, and a future reader hitting it
      // should not have to rediscover that npm.cmd is the reason.
      return {
        ok: false,
        reason:
          `spawning "${NPM}" returned EINVAL — on Windows npm is a batch file and Node `
          + "will not run one without a shell. See NEEDS_SHELL in this file.",
      };
    }
    if (code === "ETIMEDOUT" || result.signal === "SIGTERM") {
      return {
        ok: false,
        reason: `npm audit did not finish within ${AUDIT_TIMEOUT_MS / 1000}s — usually a registry that is unreachable rather than slow`,
      };
    }
    return { ok: false, reason: `npm audit failed to run: ${String(result.error.message)}` };
  }

  const stdout = result.stdout ?? "";
  if (stdout.trim() === "") {
    const stderr = (result.stderr ?? "").trim().split("\n").slice(0, 2).join(" ");
    return {
      ok: false,
      reason: `npm audit produced no stdout (exit ${result.status})${stderr ? `: ${stderr}` : ""}`,
    };
  }

  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    return {
      ok: false,
      reason: `npm audit output was not JSON (exit ${result.status}); first 120 chars: ${stdout.slice(0, 120).replace(/\s+/g, " ")}`,
    };
  }

  // The offline shape. npm reports transport failures inside the JSON rather
  // than by refusing to emit any, so this branch is the usual one on a machine
  // with no route to the registry. A connection refusal leaves `error.summary`
  // empty and puts the only readable text in a sibling `message` — take
  // whichever of the three is actually populated, or the reason is "unknown".
  if (report && report.error) {
    const { code, summary, detail } = report.error;
    const described = [summary, detail, report.message]
      .map((part) => String(part ?? "").trim())
      .find((part) => part !== "");
    return {
      ok: false,
      reason:
        `npm audit returned an error: ${code ?? "no code"}`
        + (described ? ` — ${described.split("\n")[0].slice(0, 200)}` : " (no message given)"),
    };
  }

  if (report?.auditReportVersion !== 2) {
    return {
      ok: false,
      reason:
        `npm audit returned report version ${report?.auditReportVersion ?? "(none)"}; this check `
        + "reads version 2, which is what npm 7 and later emit",
    };
  }

  if (!report.vulnerabilities || typeof report.vulnerabilities !== "object") {
    return { ok: false, reason: "npm audit report has no vulnerabilities object" };
  }

  return { ok: true, report };
}

/** Flatten `overrides`, including nested `"minimatch@3.1.5": { … }` forms. */
function collectOverrides(node, into = new Map()) {
  if (!node || typeof node !== "object") return into;
  for (const [key, value] of Object.entries(node)) {
    // A key may carry a version selector: "minimatch@10.2.5".
    const name = key.startsWith("@") ? `@${key.slice(1).split("@")[0]}` : key.split("@")[0];
    if (typeof value === "string") into.set(name, value);
    else collectOverrides(value, into);
  }
  return into;
}

/** 1-based line of the first `"name":` key in package.json, or null. */
function lineOfDependency(file, name) {
  const needle = `"${name}"`;
  for (let index = 0; index < file.lines.length; index += 1) {
    if (file.lines[index].includes(needle)) {
      return { line: index + 1, evidence: file.lines[index].trim() };
    }
  }
  return null;
}

/**
 * Walk `effects` from a vulnerable package out to the dependencies this repo
 * actually declares.
 *
 * `effects` is npm's "who did this make vulnerable" edge. Following it to a
 * name in package.json turns "brace-expansion has an advisory" into "eslint,
 * which you declared, is the thing to bump" — which is the difference between
 * a finding somebody can act on and a finding about a package they have never
 * heard of.
 */
function directDependentsOf(name, vulnerabilities, declared) {
  const found = new Set();
  const seen = new Set([name]);
  const queue = [name];
  while (queue.length > 0) {
    const current = queue.shift();
    if (declared.has(current) && current !== name) found.add(current);
    for (const next of vulnerabilities[current]?.effects ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  if (declared.has(name)) found.add(name);
  return [...found];
}

function describeFix(entry) {
  const fix = entry?.fixAvailable;
  if (fix === true) return "npm audit reports a fix is available within the current ranges";
  if (fix === false) return "npm audit reports no fix available";
  if (fix && typeof fix === "object") {
    return (
      `npm audit's fix is ${fix.name}@${fix.version}`
      + (fix.isSemVerMajor ? ", a semver-major change" : ", within the current major")
    );
  }
  return "npm audit stated no fix availability";
}

export async function run({ project, sink, coverage }) {
  const packageJson = project.get("package.json");

  /** Everything this repo names itself, so a finding can say "yours" vs "theirs". */
  const declared = new Set();
  let manifest = null;
  let overrides = new Map();
  if (packageJson) {
    try {
      manifest = JSON.parse(packageJson.text);
    } catch {
      manifest = null;
    }
    if (manifest) {
      for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
        for (const name of Object.keys(manifest[field] ?? {})) declared.add(name);
      }
      overrides = collectOverrides(manifest.overrides);
    }
  }

  // ---- structural: dependencies npm audit is blind to ---------------------
  //
  // Emitted before the audit runs, so it survives an offline machine. A
  // package fetched from a URL has no registry metadata: `npm audit` cannot
  // match it against an advisory range, and reports nothing rather than
  // reporting that it does not know.
  const opaque = [];
  if (manifest) {
    for (const field of ["dependencies", "devDependencies"]) {
      for (const [name, specifier] of Object.entries(manifest[field] ?? {})) {
        if (typeof specifier === "string" && OPAQUE_SPECIFIER.test(specifier)) {
          opaque.push({ name, specifier, field });
        }
      }
    }
  }

  for (const { name, specifier, field } of opaque) {
    const spot = lineOfDependency(packageJson, name) ?? { line: 1, evidence: `"${name}"` };
    sink.record({
      rule: "scan.config-risk",
      file: packageJson.rel,
      line: spot.line,
      title: `${name} is installed from a URL, so npm audit cannot see it`,
      expected:
        "Every dependency resolves to a registry version, so `npm audit` can match it against "
        + "advisory ranges and the dependency check above covers the whole tree.",
      actual:
        `${field}.${name} is "${specifier}". There is no registry entry and no semver version for `
        + "npm to compare, so this package and anything it depends on are absent from every "
        + "audit report — including a clean one.",
      evidence: spot.evidence,
      why:
        "This is not a claim that the package is vulnerable; it is that nothing here would ever "
        + "tell you if it were. A green audit reads as \"the tree is clear\" and silently excludes "
        + "whatever this specifier installs — and in this repo that specifier is the spreadsheet "
        + "library every XLSX export and both bulk-upload paths run untrusted uploaded files "
        + "through, which is the one place a parser advisory would matter most.",
      fix:
        "If a registry release exists at the version you want, depend on it by version and let "
        + "audit see it. If the URL is deliberate — vendors do publish outside npm — pin the "
        + "exact version, record who watches that vendor's advisories and where, and note it "
        + "here so the next reader knows this is a decision rather than an oversight.",
    });
  }

  // ---- npm audit ----------------------------------------------------------
  const audit = runAudit(project.root);

  if (!audit.ok) {
    coverage.declare({
      check: id,
      dimension: "npm advisories across the installed dependency tree",
      domainSize: 0,
      examined: 0,
      strategy: "errored",
      note:
        `THE DEPENDENCY AUDIT DID NOT RUN. ${audit.reason}. No scan.dependency-vulnerable finding `
        + "was produced, and that must not be read as a clean tree — nothing was checked. The "
        + `structural half of this check did run: ${opaque.length} dependency(ies) specified `
        + "outside the registry were reported as scan.config-risk. Re-run with network access to "
        + "the npm registry, or run `npm audit` by hand, before treating dependency risk as "
        + "assessed.",
    });
    return;
  }

  const { report } = audit;
  const vulnerabilities = report.vulnerabilities;
  const counts = report.metadata?.vulnerabilities ?? {};

  /**
   * The production-only tree, best effort.
   *
   * A high advisory in a Playwright transitive dependency and one in a package
   * that ships to Vercel are different facts, and the top-level report cannot
   * tell them apart. A second pass with `--omit=dev` can. It is best effort on
   * purpose: if it fails, the findings simply do not make the claim.
   */
  const prodAudit = runAudit(project.root, ["--omit=dev"]);
  const productionPackages = prodAudit.ok ? new Set(Object.keys(prodAudit.report.vulnerabilities)) : null;

  /**
   * Every advisory, grouped by the package it actually lives in.
   *
   * `via` mixes two things: advisory objects (this package is the vulnerable
   * one) and plain strings (this package is vulnerable because that one is).
   * Only the objects are advisories.
   */
  const byPackage = new Map();
  for (const entry of Object.values(vulnerabilities)) {
    for (const via of entry.via ?? []) {
      if (typeof via !== "object" || !via.title) continue;
      if (!GATING_SEVERITIES.has(via.severity)) continue;
      const name = via.name ?? entry.name;
      if (!byPackage.has(name)) byPackage.set(name, { advisories: new Map(), dependents: new Set() });
      byPackage.get(name).advisories.set(via.source ?? via.url ?? via.title, via);
      if (entry.name !== name) byPackage.get(name).dependents.add(entry.name);
    }
  }

  // Dependents npm marked vulnerable purely because of this package. Collected
  // from the effects graph as well as from `via`, because a package two hops
  // downstream names its immediate parent and not the original advisory.
  for (const [name, group] of byPackage) {
    for (const [otherName, entry] of Object.entries(vulnerabilities)) {
      if (otherName === name) continue;
      if ((entry.via ?? []).some((via) => typeof via === "string" && via === name)) {
        group.dependents.add(otherName);
      }
    }
  }

  const reported = [...byPackage.keys()].sort();

  for (const name of reported) {
    const { advisories, dependents } = byPackage.get(name);
    const entry = vulnerabilities[name] ?? {};
    const list = [...advisories.values()];
    const worst = list.some((via) => via.severity === "critical") ? "critical" : "high";

    const isDeclared = declared.has(name);
    const dependentChain = directDependentsOf(name, vulnerabilities, declared).filter(
      (dependent) => dependent !== name,
    );

    // Anchor the finding where somebody would edit: the package's own line if
    // this repo declares it, the override that pins it if one does, otherwise
    // the nearest declared dependent that pulls it in.
    const anchorName =
      (isDeclared && name)
      || (overrides.has(name) && name)
      || dependentChain[0]
      || null;
    const spot =
      (packageJson && anchorName && lineOfDependency(packageJson, anchorName))
      || (packageJson && lineOfDependency(packageJson, "dependencies"))
      || { line: 1, evidence: packageJson?.lines?.[0] ?? "package.json" };

    const ranges = [...new Set(list.map((via) => via.range).filter(Boolean))];
    const reach =
      productionPackages === null
        ? "Production reachability was not determined — the --omit=dev pass did not run."
        : productionPackages.has(name)
          ? "It is present in the production dependency tree (`npm audit --omit=dev` reports it), "
            + "so it ships."
          : "It is absent from `npm audit --omit=dev`, so it reaches development tooling only and "
            + "does not ship.";

    const pinned = overrides.has(name)
      ? ` package.json overrides pins ${name} to "${overrides.get(name)}", and the audit still `
        + "flags the installed version — so `npm audit fix` cannot move this one until that pin "
        + "changes."
      : "";

    sink.record({
      rule: "scan.dependency-vulnerable",
      file: packageJson?.rel ?? "package.json",
      line: spot.line,
      title:
        `${name} has ${list.length} known ${worst} ${list.length === 1 ? "advisory" : "advisories"}`
        + `${isDeclared ? " and is a direct dependency" : ""}`,
      expected:
        "No package in the installed tree carries a high or critical advisory, or the ones that "
        + "do are recorded with a reason and a date.",
      actual:
        `${name} ${isDeclared ? "is declared in package.json" : "is a transitive dependency"}. `
        + `Advisories: ${list
          .map((via) => `[${via.severity}] ${via.title} (${via.url}, affects ${via.range})`)
          .join("; ")}. `
        + `npm reports the installed range as ${entry.range || ranges.join(" / ") || "unstated"}. `
        + `${describeFix(entry)}.`
        + (dependents.size > 0
          ? ` Marked vulnerable because of it: ${[...dependents].sort().join(", ")}.`
          : "")
        + (dependentChain.length > 0
          ? ` Reached from this repo's own ${dependentChain.sort().join(", ")}.`
          : isDeclared
            ? ""
            : " No dependency declared in package.json was traceable to it through the audit's "
              + "effects graph.")
        + ` ${reach}${pinned}`,
      evidence: spot.evidence,
      why:
        "A known advisory is the one class of vulnerability an attacker does not have to find — "
        + "it is published, with a proof of concept, against a version number anybody can read "
        + "off a deployment. This app holds every student's fee ledger for a live school, so the "
        + "question a high advisory raises is not whether the flaw is exploitable in the "
        + "abstract but whether this code path reaches it, and that question deserves an answer "
        + "written down rather than left open.",
      fix:
        `${describeFix(entry)}. Take it if it is safe to take; if the fix is semver-major or `
        + "there is none, decide explicitly whether this code reaches the vulnerable path, and "
        + "waive it in tests/deep/baseline/known-findings.json with that reasoning and an expiry "
        + "rather than leaving a P1 permanently red.",
    });
  }

  const moderate = Number(counts.moderate ?? 0);
  const low = Number(counts.low ?? 0) + Number(counts.info ?? 0);

  coverage.declare({
    check: id,
    dimension: "npm advisories across the installed dependency tree",
    domainSize: Object.keys(vulnerabilities).length,
    examined: Object.keys(vulnerabilities).length,
    strategy: "exhaustive",
    note:
      `npm audit ran and returned a version 2 report over ${report.metadata?.dependencies?.total ?? "?"} `
      + `installed packages (${report.metadata?.dependencies?.prod ?? "?"} production). It flagged `
      + `${Object.keys(vulnerabilities).length} package(s): ${counts.critical ?? 0} critical, `
      + `${counts.high ?? 0} high, ${moderate} moderate, ${low} low/info. `
      + `Those collapse to ${reported.length} distinct vulnerable package(s) at high or critical `
      + "— the rest are downstream packages npm marks vulnerable because of one of these, and "
      + "reporting them separately would be reporting the same advisory several times. "
      + `The ${moderate} moderate and ${low} low advisories are counted here and deliberately not `
      + "filed: scan.dependency-vulnerable is P1 and gates, and a gating rule that fires on every "
      + "moderate advisory in build tooling is one somebody switches off. "
      + (prodAudit.ok
        ? "A second pass with --omit=dev separated shipping packages from development tooling, "
          + "and each finding says which side it is on."
        : `The --omit=dev pass did not run (${prodAudit.reason}), so no finding claims whether it `
          + "ships.")
      + " What this cannot see: any dependency whose specifier names no registry version — "
      + `${opaque.length > 0 ? `${opaque.map((item) => item.name).join(", ")} ${opaque.length === 1 ? "is" : "are"} in that category and reported separately as scan.config-risk` : "there are none in this manifest"}`
      + ". It also reflects the advisory database at the moment it ran, so an unchanged tree can "
      + "become a finding tomorrow with no commit in between — which is the intended behaviour, "
      + "not drift.",
  });
}
