import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A user-triggered change must tell the user what happened.
 *
 * Three times in one week a mutation succeeded while the screen said nothing:
 * a deleted student, a bulk update, a withdrawal. Each was fixed by hand. This
 * test fixes the category, by failing when a NEW surface ships without
 * feedback.
 *
 * Each detector asserts EXACT EQUALITY against a checked-in list, so it fails
 * in both directions: a new gap fails, and a fixed gap left in the list also
 * fails. The lists can only shrink, and they cannot rot.
 *
 * Seeded by running the detectors, never by hand.
 */

const root = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

function sourceFiles() {
  return walk(join(root, "src"));
}

/** Detector C also has to reach lib/, where the locale provider lives. */
function clientModules() {
  const out: string[] = [];
  // One root, not a list. Everything the app ships lives under src/, so a
  // folder added later (src/modules/* in the feature-first split) is covered
  // without anybody remembering to widen this.
  for (const dir of ["src"]) {
    const base = join(root, dir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const full = join(base, entry);
      if (statSync(full).isDirectory()) {
        walkAny(full, out);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        out.push(full);
      }
    }
  }
  return out;
}

function walkAny(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkAny(full, out);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function relative(file: string) {
  return file.slice(root.length + 1).split("\\").join("/");
}

/**
 * Comments and string literals are stripped before matching. Without this a
 * commented-out form or a docstring mentioning `action={` counts as a hit.
 */
function stripNoise(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

function hasFeedback(code: string) {
  return (
    code.includes("useActionFeedback") ||
    code.includes("useActionFeedbackMany") ||
    code.includes("FlashNotice") ||
    code.includes("toast(") ||
    // Redirect-with-notice: a Server Action that ends in
    // `redirect("/page?notice=...")` and a page that renders that param. It is
    // the pattern the Dashboard already uses for every action it hosts, and it
    // reports the result just as plainly as a FlashNotice does — the staffer
    // lands back on the page with a green bar explaining what happened.
    //
    // Both halves are required. Reading the param without rendering it, or
    // rendering a notice nobody sets, is not feedback.
    // `[Ss]earchParams` because the prop is `searchParams` but the awaited
    // local is conventionally `resolvedSearchParams`.
    (/[Ss]earchParams\??\.notice/.test(code) && /<Notice[\s>]/.test(code))
  );
}

/** Identifiers bound by `const [state, formAction] = useActionState(...)`. */
function actionStateBindings(code: string) {
  const bound = new Set<string>();
  const pattern = /const\s*\[\s*([\w$]+)\s*,\s*([\w$]+)\s*(?:,\s*([\w$]+)\s*)?\]\s*=\s*useActionState/g;

  for (let m = pattern.exec(code); m; m = pattern.exec(code)) {
    bound.add(m[2]!);
  }

  return bound;
}

const files = sourceFiles().map((file) => ({
  path: relative(file),
  code: stripNoise(readFileSync(file, "utf8")),
}));

// ---------------------------------------------------------------------------
// Detector A — useActionState without feedback
// ---------------------------------------------------------------------------

const A_KNOWN_GAPS: string[] = [
  // Auth surfaces: success is a server redirect away from the page, so there is
  // no post-action render on which to show a message. Errors render inline.
  "src/app/page.tsx",
  "src/ui/auth/login-form.tsx",
];

describe("every useActionState surface reports its result", () => {
  it("has no unlisted surfaces", () => {
    const offenders = files
      .filter(({ code }) => code.includes("useActionState(") && !hasFeedback(code))
      .map(({ path }) => path)
      .sort();

    expect(offenders).toEqual([...A_KNOWN_GAPS].sort());
  });

  it("has no stale entries", () => {
    for (const entry of A_KNOWN_GAPS) {
      expect(existsSync(join(root, entry))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Detector B — a form bound straight to an imported server action
// ---------------------------------------------------------------------------
// These throw to the nearest error boundary on failure: a blank screen with no
// clue which record failed. They need feedback AND a pending control.

/**
 * Every raw action form, with why it is acceptable — or that it is not yet.
 * "redirects with a banner" means the action ends in redirect(...?notice=/
 * ?error=/?done=) and the destination page renders it, which is a valid way to
 * report an outcome even though this file cannot see it.
 */
const B_ALLOWED: Record<string, string> = {
  "src/app/protected/admin-tools/page.tsx": "redirects to ?reconciled=/?error=, rendered by session-health",
  "src/app/protected/admin-tools/session-health/session-health-grid.tsx": "redirects with a banner",
  "src/app/protected/admin-tools/promotion/page.tsx": "redirects to ?notice=/?error=, rendered by the run page",
  "src/modules/imports/ui/batch-upload-card.tsx": "redirects to ?notice=/?error=, rendered by the imports workflow",
  "src/modules/imports/ui/column-mapping-card.tsx": "redirects to ?notice=/?error=",
  "src/modules/imports/ui/duplicate-audit-panel.tsx": "redirects to ?notice=/?error=",
  "src/modules/imports/ui/import-commit-card.tsx": "redirects to ?notice=/?error=",
  "src/modules/imports/ui/row-detail-card.tsx": "redirects to ?notice=/?error=",
  "src/ui/auth/logout-button.tsx": "sign-out; landing on the login page is the outcome",
  "src/ui/shell/app-topbar.tsx": "sign-out; landing on the login page is the outcome",
  "src/ui/mobile/account-card.tsx": "sign-out; landing on the login page is the outcome",
};

const B_KNOWN_GAPS: string[] = Object.keys(B_ALLOWED);

/** Anything that reports work-in-flight from inside the form. */
function hasPendingControl(code: string) {
  return (
    code.includes("PendingSubmitButton") ||
    code.includes("SignOutSubmit") ||
    code.includes("useFormStatus") ||
    /loading=\{/.test(code)
  );
}

function rawActionForms(code: string) {
  const bound = actionStateBindings(code);

  return (code.match(/<form[^>]*\saction=\{([\w$.]+)\}/g) ?? []).filter((tag) => {
    const name = /action=\{([\w$.]+)\}/.exec(tag)?.[1] ?? "";
    // A bound formAction is Detector A's business, not ours.
    return !bound.has(name) && !name.startsWith("form");
  });
}

describe("fire-and-forget action forms report their result", () => {
  it("has no unlisted surfaces", () => {
    const offenders = files
      .filter(({ code }) => rawActionForms(code).length > 0 && !hasFeedback(code))
      .map(({ path }) => path)
      .sort();

    expect(offenders).toEqual([...B_KNOWN_GAPS].sort());
  });

  it("has no stale entries", () => {
    for (const entry of B_KNOWN_GAPS) {
      expect(existsSync(join(root, entry))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Pending detector — a form the user can submit twice
// ---------------------------------------------------------------------------

/**
 * Forms the user can submit twice because nothing shows the first submit
 * registered. This list must only ever shrink.
 */
const PENDING_KNOWN_GAPS: string[] = [
  // The per-entry decision <select> submits its own tiny form inside a wide
  // table of them. A spinner per row would be noise; the redirect and the
  // FlashNotice are the signal.
  "src/app/protected/admin-tools/promotion/[runId]/page.tsx",
];

describe("fire-and-forget action forms show they are working", () => {
  it("has no unlisted surfaces", () => {
    const offenders = files
      .filter(({ code }) => rawActionForms(code).length > 0 && !hasPendingControl(code))
      .map(({ path }) => path)
      .sort();

    expect(offenders).toEqual([...PENDING_KNOWN_GAPS].sort());
  });
});

// ---------------------------------------------------------------------------
// Detector C — a discarded action promise
// ---------------------------------------------------------------------------
// `void someAction(...)` cannot fail visibly. There is no legitimate use.

describe("no server action result is thrown away", () => {
  it("finds no discarded action promises", () => {
    const offenders = clientModules()
      .filter((file) => /void\s+\w*[Aa]ction\s*\(/.test(stripNoise(readFileSync(file, "utf8"))))
      .map(relative)
      .sort();

    expect(offenders).toEqual([]);
  });
});
