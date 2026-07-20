import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Two projects, deliberately separated:
 *
 * - `node` keeps the existing ~190 suites exactly as they were (environment
 *   "node", tests/setup.ts). Most of them are static-source assertions and
 *   pure-logic tests that must not pay for a DOM.
 * - `interaction` runs real DOM tests (jsdom + @testing-library) for behavior
 *   that source-string assertions cannot prove: focus traps actually trapping,
 *   the back button actually closing a sheet, a list actually rendering more
 *   than 20 rows.
 *
 * NOTE: vitest 4 removed `environmentMatchGlobs`; `projects` is the supported
 * way to mix environments in one run.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**/*.ts", "app/protected/**/*.ts"],
      exclude: ["**/*.d.ts", "lib/db/types.ts"],
    },
    projects: [
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "node",
          environment: "node",
          globals: true,
          setupFiles: [path.resolve(rootDir, "tests/setup.ts")],
          include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
          exclude: ["tests/ui/interaction/**"],
        },
      },
      {
        plugins: [tsconfigPaths()],
        test: {
          name: "interaction",
          environment: "jsdom",
          globals: true,
          setupFiles: [path.resolve(rootDir, "tests/ui/interaction/setup.ts")],
          include: ["tests/ui/interaction/**/*.test.tsx"],
        },
      },
    ],
  },
});
