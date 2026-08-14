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
  // Added when Receipts grew a real filter sheet — until then it was a search
  // box, and the only route in the daily set with no ceiling over it.
  "receipts",
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
  const legacyEntryChunks = manifest?.entryJSFiles?.[entryKey] ?? [];
  const next16ClientChunks = Object.values(manifest?.clientModules ?? {}).flatMap(
    (module) => module?.chunks ?? [],
  );
  const chunks = [
    ...new Set(
      (legacyEntryChunks.length > 0 ? legacyEntryChunks : next16ClientChunks).filter(
        (chunk) => typeof chunk === "string" && chunk.endsWith(".js"),
      ),
    ),
  ];

  if (chunks.length === 0) {
    throw new Error(`No client JavaScript chunks found for ${routePath}.`);
  }
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

/**
 * The chunks every route loads before its own.
 *
 * These were invisible to this gate for its whole life, which is how the Sentry
 * browser SDK sat in the shared bundle at 151.6 KB gzip while all eight route
 * ceilings stayed green. Half of first-load JS was outside the budget.
 */
async function measureShared() {
  const manifest = JSON.parse(await readFile(".next/build-manifest.json", "utf8"));
  const files = [...new Set(manifest.rootMainFiles ?? [])].filter((file) =>
    file.endsWith(".js"),
  );

  if (files.length === 0) {
    throw new Error("No rootMainFiles in .next/build-manifest.json.");
  }

  let rawBytes = 0;
  let gzipBytes = 0;

  for (const file of files) {
    const filePath = path.resolve(".next", file);
    const [fileStat, contents] = await Promise.all([stat(filePath), readFile(filePath)]);
    rawBytes += fileStat.size;
    gzipBytes += gzipSync(contents).length;
  }

  return { route: "(shared) rootMainFiles", chunks: files.length, rawBytes, gzipBytes };
}

const measurements = [];
for (const route of routes) measurements.push(await measure(route));
const shared = await measureShared();

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

  const sharedCeiling = baseline.shared?.targetGzipBytes ?? baseline.shared?.gzipBytes;

  if (typeof sharedCeiling === "number" && shared.gzipBytes > sharedCeiling) {
    failures.push(
      `${shared.route}: ${shared.gzipBytes} gzip bytes; ceiling is ${sharedCeiling}. ` +
        "Every route pays this one — check for a static import of a heavy SDK.",
    );
  }

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
      shared,
      measurements,
      // What a browser actually downloads before a route can render.
      firstLoadGzipBytes: Object.fromEntries(
        measurements.map((item) => [item.route, item.gzipBytes + shared.gzipBytes]),
      ),
    },
    null,
    2,
  ),
);
