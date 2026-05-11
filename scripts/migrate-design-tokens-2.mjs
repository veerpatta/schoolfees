// Follow-up: clean up stragglers the first pass didn't cover.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOTS = ["app/protected", "components"];

const REPLACEMENTS = [
  // Divider colors
  ["divide-slate-200", "divide-border"],
  ["divide-slate-100", "divide-border"],

  // Focus & input states
  ["focus-visible:border-slate-400", "focus-visible:border-accent"],
  ["focus-visible:ring-slate-400", "focus-visible:ring-ring/40"],

  // Slate edge cases the first pass missed
  ["bg-slate-300", "bg-border-strong"],
  ["border-slate-400", "border-border-strong"],
  ["print:border-slate-400", "print:border-border-strong"],
  ["text-slate-100/50", "text-foreground/8"],
  ["text-slate-100/60", "text-foreground/8"],

  // Tonal stragglers
  ["text-red-500", "text-destructive"],
  ["text-red-600", "text-destructive"],
  ["text-sky-950", "text-foreground"],
  ["border-emerald-300", "border-success/40"],
  ["border-amber-300", "border-warning/40"],
  ["border-red-300", "border-destructive/40"],
  ["border-sky-300", "border-info/40"],
  ["border-blue-300", "border-info/40"],
  ["border-violet-200", "border-info/30"],
  ["bg-violet-50", "bg-info-soft"],

  // Shadow chrome
  ["shadow-slate-200/60", "shadow-md"],
  ["shadow-slate-200", "shadow-md"],

  // Receipt rainbow strip → quiet ink rule
  ["bg-gradient-to-r from-emerald-600 via-sky-500 to-amber-500", "bg-foreground/85"],

  // Common dashed-border accents
  ["border-dashed border-emerald-300", "border-dashed border-success/40"],
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

async function migrate() {
  const files = [];
  for (const root of ROOTS) await walk(root, files);

  let changed = 0;
  for (const file of files) {
    let content = await readFile(file, "utf8");
    const original = content;

    for (const [needle, replacement] of REPLACEMENTS) {
      if (content.includes(needle)) {
        content = content.split(needle).join(replacement);
      }
    }

    if (content !== original) {
      await writeFile(file, content, "utf8");
      changed++;
      console.log("updated", file);
    }
  }
  console.log(`done. ${changed} files changed.`);
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
