// One-off script. Mechanically swaps raw Tailwind color classes for the new
// semantic tokens used in the "Ledger Calm" design system. Idempotent.
//
// Usage:  node scripts/migrate-design-tokens.mjs
//
// Run from repo root.

import { readFile, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOTS = ["app/protected", "components"];
const SKIP = new Set([
  // Already done by hand
  "components/payments/payment-entry-client.tsx",
  "components/ui",
  "components/admin",
  "components/branding",
  "components/office",
  "components/dashboard",
  "app/protected/dashboard",
  "app/protected/payments",
]);

// Order matters — longest / most-specific patterns first.
const TONAL_PAIRS = [
  // Destructive (rose / red)
  [/border-(?:rose|red)-200 bg-(?:rose|red)-50 text-(?:rose|red)-(?:600|700|800|900|950)/g, "bg-destructive-soft text-destructive-soft-foreground"],
  [/border-(?:rose|red)-200 bg-(?:rose|red)-50/g, "bg-destructive-soft"],
  // Warning (amber / orange)
  [/border-(?:amber|orange)-200 bg-(?:amber|orange)-50 text-(?:amber|orange)-(?:700|800|900|950)/g, "bg-warning-soft text-warning-soft-foreground"],
  [/border-(?:amber|orange)-200 bg-(?:amber|orange)-50/g, "bg-warning-soft"],
  // Success (emerald / green / teal)
  [/border-(?:emerald|green|teal)-200 bg-(?:emerald|green|teal)-50 text-(?:emerald|green|teal)-(?:700|800|900)/g, "bg-success-soft text-success-soft-foreground"],
  [/border-(?:emerald|green|teal)-200 bg-(?:emerald|green|teal)-50/g, "bg-success-soft"],
  // Info (sky / blue / indigo / cyan)
  [/border-(?:sky|blue|indigo|cyan)-200 bg-(?:sky|blue|indigo|cyan)-50 text-(?:sky|blue|indigo|cyan)-(?:700|800|900|950)/g, "bg-info-soft text-info-soft-foreground"],
  [/border-(?:sky|blue|indigo|cyan)-200 bg-(?:sky|blue|indigo|cyan)-50/g, "bg-info-soft"],
  [/border-(?:sky|blue|indigo|cyan)-100 bg-(?:sky|blue|indigo|cyan)-50/g, "bg-info-soft"],
];

const FLAT_REPLACEMENTS = [
  // Slate neutrals
  ["border-slate-100", "border-border"],
  ["border-slate-200", "border-border"],
  ["border-slate-300", "border-border-strong"],
  ["text-slate-950", "text-foreground"],
  ["text-slate-900", "text-foreground"],
  ["text-slate-800", "text-foreground"],
  ["text-slate-700", "text-foreground"],
  ["text-slate-600", "text-muted-foreground"],
  ["text-slate-500", "text-muted-foreground"],
  ["text-slate-400", "text-subtle-foreground"],
  ["text-slate-300", "text-subtle-foreground"],
  ["bg-slate-50", "bg-surface-2"],
  ["bg-slate-100", "bg-surface-2"],
  ["bg-slate-200", "bg-surface-3"],
  ["bg-slate-900", "bg-foreground"],
  ["bg-slate-950/40", "bg-foreground/30"],
  ["bg-slate-950/60", "bg-foreground/50"],
  ["bg-slate-950", "bg-foreground"],
  ["bg-white/95", "bg-card/95"],
  ["bg-white/90", "bg-card/90"],
  ["bg-white/85", "bg-card/85"],
  ["bg-white/80", "bg-card/80"],
  ["bg-white/70", "bg-card/70"],
  ["bg-white/60", "bg-card/60"],
  // bg-white must come after the slash-alpha variants
  ["bg-white", "bg-card"],

  // Tonal loose ends (text)
  ["text-rose-600", "text-destructive"],
  ["text-rose-700", "text-destructive-soft-foreground"],
  ["text-rose-800", "text-destructive-soft-foreground"],
  ["text-red-600", "text-destructive"],
  ["text-red-700", "text-destructive-soft-foreground"],
  ["text-red-800", "text-destructive-soft-foreground"],
  ["text-red-900", "text-destructive-soft-foreground"],
  ["text-red-950", "text-destructive-soft-foreground"],
  ["text-amber-600", "text-warning"],
  ["text-amber-700", "text-warning-soft-foreground"],
  ["text-amber-800", "text-warning-soft-foreground"],
  ["text-amber-900", "text-warning-soft-foreground"],
  ["text-amber-950", "text-warning-soft-foreground"],
  ["text-orange-700", "text-warning-soft-foreground"],
  ["text-orange-800", "text-warning-soft-foreground"],
  ["text-emerald-600", "text-success"],
  ["text-emerald-700", "text-success-soft-foreground"],
  ["text-emerald-800", "text-success-soft-foreground"],
  ["text-emerald-900", "text-success-soft-foreground"],
  ["text-green-700", "text-success-soft-foreground"],
  ["text-green-800", "text-success-soft-foreground"],
  ["text-sky-600", "text-info"],
  ["text-sky-700", "text-info-soft-foreground"],
  ["text-sky-800", "text-info-soft-foreground"],
  ["text-sky-900", "text-info-soft-foreground"],
  ["text-blue-600", "text-info"],
  ["text-blue-700", "text-info-soft-foreground"],
  ["text-blue-800", "text-info-soft-foreground"],
  ["text-blue-900", "text-info-soft-foreground"],
  ["text-blue-950", "text-info-soft-foreground"],
  ["text-indigo-700", "text-info-soft-foreground"],

  // Tonal loose ends (bg)
  ["bg-red-50", "bg-destructive-soft"],
  ["bg-red-100", "bg-destructive-soft"],
  ["bg-rose-50", "bg-destructive-soft"],
  ["bg-rose-100", "bg-destructive-soft"],
  ["bg-amber-50", "bg-warning-soft"],
  ["bg-amber-100", "bg-warning-soft"],
  ["bg-orange-50", "bg-warning-soft"],
  ["bg-emerald-50", "bg-success-soft"],
  ["bg-emerald-100", "bg-success-soft"],
  ["bg-green-50", "bg-success-soft"],
  ["bg-green-100", "bg-success-soft"],
  ["bg-sky-50", "bg-info-soft"],
  ["bg-sky-100", "bg-info-soft"],
  ["bg-blue-50", "bg-info-soft"],
  ["bg-blue-100", "bg-info-soft"],
  ["bg-indigo-50", "bg-info-soft"],

  // Strong bg (for bars / accents)
  ["bg-emerald-500", "bg-success"],
  ["bg-emerald-600", "bg-success"],
  ["bg-green-500", "bg-success"],
  ["bg-green-600", "bg-success"],
  ["bg-amber-500", "bg-warning"],
  ["bg-amber-600", "bg-warning"],
  ["bg-orange-500", "bg-warning"],
  ["bg-red-500", "bg-destructive"],
  ["bg-red-600", "bg-destructive"],
  ["bg-rose-500", "bg-destructive"],
  ["bg-sky-500", "bg-info"],
  ["bg-sky-600", "bg-info"],
  ["bg-blue-500", "bg-info"],
  ["bg-blue-600", "bg-info"],

  // Tonal borders
  ["border-rose-200", "border-destructive/30"],
  ["border-rose-100", "border-destructive/20"],
  ["border-red-200", "border-destructive/30"],
  ["border-red-100", "border-destructive/20"],
  ["border-amber-200", "border-warning/30"],
  ["border-amber-100", "border-warning/20"],
  ["border-orange-200", "border-warning/30"],
  ["border-emerald-200", "border-success/30"],
  ["border-emerald-100", "border-success/20"],
  ["border-green-200", "border-success/30"],
  ["border-sky-200", "border-info/30"],
  ["border-sky-100", "border-info/20"],
  ["border-blue-200", "border-info/30"],
  ["border-blue-100", "border-info/20"],
  ["border-indigo-200", "border-info/30"],

  // Old keyframe utilities → new
  ["animate-bottom-sheet-up", "anim-slide-up"],
  ["animate-pop-in", "anim-scale-in"],
  ["animate-success-check", "anim-scale-in"],
  ["animate-soft-shimmer", "anim-shimmer"],
  ["animate-shimmer-fast", "anim-shimmer"],
  ["animate-loading-bar", "anim-route-progress"],
  ["animate-reveal-up", "anim-slide-up"],
  ["animate-slide-up-fade", "anim-slide-up"],
  ["animate-receipt-settle", "anim-slide-up"],
  ["animate-float-slow", ""],
  ["animate-float-delayed", ""],

  // Ring tokens
  ["ring-sky-100", "ring-ring/30"],
  ["ring-sky-200", "ring-ring/40"],
  ["ring-blue-100", "ring-ring/30"],
];

async function walk(dir, acc) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      await walk(path, acc);
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      acc.push(path);
    }
  }
}

function shouldSkip(path) {
  const normalized = path.replace(/\\/g, "/");
  for (const skip of SKIP) {
    if (normalized.endsWith(skip) || normalized.includes(`/${skip}/`)) {
      return true;
    }
  }
  return false;
}

async function migrate() {
  const files = [];
  for (const root of ROOTS) {
    await walk(root, files);
  }

  let changed = 0;
  for (const file of files) {
    if (shouldSkip(file)) continue;
    let content = await readFile(file, "utf8");
    const original = content;

    for (const [pattern, replacement] of TONAL_PAIRS) {
      content = content.replace(pattern, replacement);
    }

    for (const [needle, replacement] of FLAT_REPLACEMENTS) {
      if (content.includes(needle)) {
        content = content.split(needle).join(replacement);
      }
    }

    if (content !== original) {
      // Re-apply original line-break style by trusting the original line endings
      await writeFile(file, content, "utf8");
      changed++;
      console.log("updated", file);
    }
  }

  console.log(`done. ${changed} files changed.`);
}

migrate().catch((error) => {
  console.error(error);
  process.exit(1);
});
