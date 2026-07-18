import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { gzipSync } from "node:zlib";

const routes = [
  "dashboard",
  "students",
  "fee-setup",
  "payments",
  "transactions",
  "defaulters",
  "exports",
  "admin-tools",
];

async function measure(route) {
  const manifestPath = path.resolve(
    ".next/server/app/protected",
    route,
    "page_client-reference-manifest.js",
  );
  const source = await readFile(manifestPath, "utf8");
  const context = { globalThis: {} };
  vm.runInNewContext(source, context, { filename: manifestPath });
  const routePath = `/protected/${route}/page`;
  const manifest = context.globalThis.__RSC_MANIFEST?.[routePath];
  const entryKey = `[project]/app/protected/${route}/page`;
  const chunks = [...new Set(manifest?.entryJSFiles?.[entryKey] ?? [])];
  let rawBytes = 0;
  let gzipBytes = 0;

  for (const chunk of chunks) {
    const filePath = path.resolve(".next", chunk);
    const [fileStat, contents] = await Promise.all([stat(filePath), readFile(filePath)]);
    rawBytes += fileStat.size;
    gzipBytes += gzipSync(contents).length;
  }

  return {
    route: `/protected/${route}`,
    chunks: chunks.length,
    rawBytes,
    gzipBytes,
  };
}

const measurements = [];
for (const route of routes) measurements.push(await measure(route));

if (process.argv.includes("--check")) {
  const baseline = JSON.parse(await readFile("quality/route-bundle-baseline.json", "utf8"));
  const currentByRoute = new Map(measurements.map((item) => [item.route, item]));
  const failures = baseline.measurements.flatMap((item) => {
    const current = currentByRoute.get(item.route);
    const ceiling = item.targetGzipBytes ?? item.gzipBytes;
    return !current || current.gzipBytes > ceiling
      ? [`${item.route}: ${current?.gzipBytes ?? "missing"} gzip bytes; ceiling is ${ceiling}.`]
      : [];
  });
  if (failures.length > 0) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
}

console.log(
  JSON.stringify(
    {
      generatedFrom: "next-build",
      metric: "initial entry JS, unique chunks",
      measurements,
    },
    null,
    2,
  ),
);
