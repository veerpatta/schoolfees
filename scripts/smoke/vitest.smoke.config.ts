import { defineConfig } from "vitest/config";

/**
 * A separate config so the live WhatsApp smoke NEVER joins `npm run test`.
 *
 * The main config includes `tests/**`; this one includes only
 * `scripts/smoke/**`. Two layers of protection, because the failure mode is
 * sending real messages to a real phone from CI:
 *
 *   1. This file is not the default config, so the suite has to be asked for
 *      by name.
 *   2. The suite itself refuses to run without `SMOKE_WHATSAPP_TO`, so even
 *      running it by accident sends nothing.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    name: "smoke",
    environment: "node",
    globals: true,
    include: ["scripts/smoke/**/*.smoke.ts"],
    // Stubs `server-only` and loads .env.local — see the file for why both.
    setupFiles: ["scripts/smoke/setup.ts"],
    // A real PDF render plus three provider round trips to Mumbai.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
