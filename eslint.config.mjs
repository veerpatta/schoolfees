import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Next 16 enables the experimental React compiler lint suite. The app
    // still supports deliberate effect-driven hydration and mutable render
    // accumulators in established, tested components. Keep the previous
    // production lint contract while those patterns are migrated in focused
    // UI refactors instead of turning this dependency patch into a rewrite.
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // Playwright fixtures take a callback conventionally named `use`, and the
    // React Hooks rule sees `use(...)` inside a plain function and calls it a
    // misplaced hook. It is not — there is no React in this directory at all.
    // Scoped to the harness rather than globally ignored, so every other rule
    // still applies to it.
    files: ["tests/deep/**/*.ts", "tests/deep/**/*.mjs"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  globalIgnores([
    ".next/**",
    ".vercel/**",
    "out/**",
    "dist/**",
    ".claude/**",
    "supabase/functions/**",
    // Harness output. Playwright's HTML reporter ships its own minified viewer
    // bundle in here; linting it produced 245 errors in somebody else's code.
    // Gitignored is not the same as lint-ignored in a flat config.
    "docs/smoke-reports/**",
  ]),
]);
