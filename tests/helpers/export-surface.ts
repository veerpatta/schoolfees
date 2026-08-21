import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The export surface, as one string.
 *
 * `app/protected/exports/[exportType]/route.ts` used to be all of it — 2,182
 * lines, of which one function was 1,383. It is now a dispatcher plus three
 * files, and a test that asserts "the exports never do X" wants to look at all
 * four rather than at whichever one happens to hold the code today.
 *
 * Reading them joined also makes the negative assertions stronger: "never
 * embeds installments off payment_adjustments" now covers the whole surface
 * instead of one file the code could simply move out of.
 */
export const EXPORT_SURFACE_FILES = [
  "src/app/protected/exports/[exportType]/route.ts",
  "src/modules/exports/data/ai-context-bundle.ts",
  "src/modules/exports/data/responses.ts",
  "src/modules/exports/domain/defaulter-filters.ts",
] as const;

export function readExportSurface(): string {
  return EXPORT_SURFACE_FILES.map((rel) =>
    readFileSync(join(process.cwd(), rel), "utf8"),
  ).join("\n");
}
