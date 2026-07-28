import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (entry.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A `min-w-[1600px]` table inside an `overflow-x-auto` technically "works" on
 * a 375px phone, but reading one row means scrubbing sideways through twelve
 * columns and losing your place. The phone app answers those with card lists
 * (`MobileRecordCard`) and hides the table behind `md:`.
 *
 * Anything genuinely desktop-only is listed below with the reason, so adding a
 * new wide table is a deliberate decision rather than an accident.
 */
const DESKTOP_ONLY = new Map<string, string>([
  [
    "components/dashboard/class-collection-progress.tsx",
    "renders only inside the dashboard's hidden md:block branch",
  ],
  [
    "components/payments/bulk/bulk-payment-workflow.tsx",
    "admin bulk-entry desk surface — a keyboard-and-mouse workflow by design",
  ],
  [
    "app/protected/students/[studentId]/page.tsx",
    "the whole desktop tree sits inside one `hidden md:block` branch; the phone renders MobileStudentProfile instead",
  ],
]);

describe("wide tables on phones", () => {
  it("hides every wide table behind md: unless it is listed as desktop-only", () => {
    const offenders: string[] = [];

    for (const root of ["components", "app"]) {
      for (const file of walk(join(process.cwd(), root))) {
        const relative = file.slice(process.cwd().length + 1).split("\\").join("/");
        const lines = readFileSync(file, "utf8").split("\n");

        lines.forEach((line, index) => {
          const match = /min-w-\[(\d{3,})px\]/.exec(line);
          if (!match || !line.includes("<table")) return;

          const context = lines.slice(Math.max(0, index - 3), index + 1).join("\n");
          const guarded =
            context.includes("md:block") ||
            context.includes("md:table") ||
            context.includes("hidden");
          if (guarded || DESKTOP_ONLY.has(relative)) return;

          offenders.push(`${relative}:${index + 1} (${match[1]}px)`);
        });
      }
    }

    expect(
      offenders,
      `these need a md:hidden card list beside them, or an entry in DESKTOP_ONLY:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
