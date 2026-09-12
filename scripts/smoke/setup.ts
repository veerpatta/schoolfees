import { vi } from "vitest";
import fs from "node:fs";

/**
 * What the smoke suites need that the app gets from Next.
 *
 * Two things, both absent under vitest:
 *
 *   - `server-only` is a Next marker module that is not installed in this repo.
 *     `tests/setup.ts` stubs it for the main suite; these files import the same
 *     `server-only` modules, so they need the same stub.
 *   - `.env.local`. Next injects env into the app; vitest does not. Without it
 *     `NEXT_PUBLIC_SCHOOL_ADDRESS` and friends read empty, and a rendered
 *     letterhead silently loses the contact line — so the document being
 *     reviewed is not the document production sends.
 */

vi.mock("server-only", () => ({}));

function loadEnvLocal(): void {
  let raw = "";
  try {
    raw = fs.readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rest] = match;
    // Anything already exported wins, so a one-off override on the command line
    // is not silently replaced by the file.
    if (process.env[key]) continue;
    process.env[key] = rest.trim().replace(/^["']|["']$/g, "");
  }
}

loadEnvLocal();
