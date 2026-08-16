import { mkdirSync } from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

/**
 * Where evidence goes.
 *
 * Two destinations on purpose. Traces, videos, downloads and every P2/P3
 * screenshot are bulky and land under `docs/smoke-reports/deep/<runId>/`, which
 * `.gitignore` already covers. Only the report itself and P0/P1 screenshots are
 * copied into `docs/qa/deep-test/`, which is committed — so the repo grows by a
 * handful of PNGs per run rather than by gigabytes, and a finding filed six
 * months ago still has its picture.
 */

export const COMMITTED_ROOT = path.resolve(process.cwd(), "docs/qa/deep-test");
export const BULK_ROOT = path.resolve(process.cwd(), "docs/smoke-reports/deep");

export function runId(): string {
  const existing = process.env.DEEP_RUN_ID?.trim();
  if (existing) return existing;
  throw new Error(
    "DEEP_RUN_ID is not set. It is minted in tests/deep/global-setup.ts and " +
      "must be present for every artifact path to agree.",
  );
}

export function bulkDir(...segments: string[]): string {
  const dir = path.join(BULK_ROOT, runId(), ...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function committedDir(...segments: string[]): string {
  const dir = path.join(COMMITTED_ROOT, ...segments);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function slug(value: string): string {
  return value
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 90);
}

export function repoRelative(absolutePath: string): string {
  return path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");
}

/**
 * A screenshot that does not take the run down with it.
 *
 * `fullPage` on a long dashboard can outlive its timeout; a viewport shot is
 * still evidence, and "(screenshot failed)" is better than losing the finding
 * that needed it.
 */
export async function screenshot(page: Page, name: string): Promise<string> {
  const filePath = path.join(bulkDir("screenshots"), `${slug(name)}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: true, timeout: 45_000 });
  } catch {
    try {
      await page.screenshot({ path: filePath, fullPage: false, timeout: 30_000 });
    } catch {
      return "(screenshot failed)";
    }
  }
  return repoRelative(filePath);
}

export function downloadDir(): string {
  return bulkDir("downloads");
}

/**
 * The `repro:` line every finding carries.
 *
 * This is what makes the report usable by someone who did not run it. A
 * finding without a command to re-run it is an anecdote.
 */
export function reproCommand(options: {
  target: string;
  grep: string;
  project?: string;
}): string {
  const project = options.project ? ` --project=${options.project}` : "";
  return (
    `DEEP_TARGET=${options.target} npx playwright test ` +
    `-c tests/deep/deep.config.ts --grep "${options.grep}"${project}`
  );
}
