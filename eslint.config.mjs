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
  globalIgnores([
    ".next/**",
    ".vercel/**",
    "out/**",
    "dist/**",
    ".claude/**",
    "supabase/functions/**",
  ]),
]);
