import { chromium } from "@playwright/test";

const base = "https://schoolfees-two.vercel.app";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

// Sentry POSTs events to an ingest endpoint. Watching the network is the only
// end-to-end proof that capture still works after the SDK was deferred.
const ingest = [];
page.on("request", (r) => {
  if (/sentry|ingest\.de\.sentry\.io/i.test(r.url())) {
    ingest.push(`${r.method()} ${r.url().slice(0, 110)}`);
  }
});

await page.goto(`${base}/auth/login`, { waitUntil: "load", timeout: 60000 });

const beforeIdle = await page.evaluate(() => Boolean(window.__SENTRY__));
console.log(`__SENTRY__ present immediately after load : ${beforeIdle}`);

// The whole point of the change: the SDK arrives on requestIdleCallback.
await page.waitForFunction(() => Boolean(window.__SENTRY__), null, { timeout: 20000 })
  .then(() => console.log("__SENTRY__ present after idle           : true"))
  .catch(() => console.log("__SENTRY__ present after idle           : FALSE  <-- capture is broken"));

const clientBound = await page.evaluate(() => {
  const hub = window.__SENTRY__;
  if (!hub) return "no __SENTRY__";
  const versions = Object.keys(hub);
  const stack = hub.stack || hub.hub;
  return JSON.stringify({ keys: versions.slice(0, 8), hasStack: Boolean(stack) });
});
console.log(`sentry global shape                     : ${clientBound}`);

// Fire a real unhandled error and see whether it reaches the ingest endpoint.
const marker = `vpps-capture-check-${process.env.MARKER ?? "x"}`;
await page.evaluate((m) => {
  setTimeout(() => {
    throw new Error(m);
  }, 0);
}, marker);

await page.waitForTimeout(6000);

console.log(`marker thrown                           : ${marker}`);
console.log(`sentry ingest requests seen             : ${ingest.length}`);
for (const line of ingest.slice(0, 6)) console.log(`   ${line}`);

await browser.close();
