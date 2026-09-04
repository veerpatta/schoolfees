import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/platform/i18n/request.ts");

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Expose the Vercel deploy environment to the browser. Vercel only provides
  // the server-side VERCEL_ENV automatically, so without this the client-side
  // Sentry SDK always falls back to "development" and prod browser errors can't
  // be filtered by environment. Inlined at build time; undefined locally → the
  // client config's "development" fallback applies.
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV,
  },
  // @react-pdf/renderer (with its pdfkit/fontkit deps) loads binary font-metric
  // data at runtime. Bundling it breaks Vercel's serverless file tracing (the
  // .afm data gets dropped → renderToBuffer throws and the fee-pdf routes 500).
  // Marking it external makes Next require it from node_modules so Vercel traces
  // the whole package, including its data files.
  serverExternalPackages: ["@react-pdf/renderer"],
  // React Compiler, opt-in only. `annotation` compiles nothing unless a
  // component says `"use memo"`, so the Babel pass it adds to the webpack
  // build touches only the files that ask for it. The Payment Desk screens
  // do: a 3,500-line component with ~96 hooks re-rendered every ancestor on
  // each keystroke of the amount and the student search, which is what the
  // phone's input lag was made of. Everything else keeps its hand-written
  // memoisation and is compiled by nothing.
  reactCompiler: { compilationMode: "annotation" },
  // The fee-statement PDF registers a Devanagari TTF (public/fonts) at runtime
  // for the Hindi half of every bilingual label. Vercel's serverless tracer
  // does not see the file path passed to Font.register, so include the fonts
  // explicitly for both fee-pdf routes or the Hindi text 500s in production.
  // Every PDF route reads two things off disk that the tracer cannot infer from
  // a computed `path.join(process.cwd(), …)`: the Devanagari fonts, and the
  // school mark now that documents carry a letterhead. Miss an entry here and
  // the route works in `next dev` and 500s on Vercel — the failure only ever
  // shows up in a deployment.
  outputFileTracingIncludes: {
    "/protected/students/[studentId]/fee-pdf": [
      "./public/fonts/**",
      "./public/branding/icon-192.png",
    ],
    "/protected/students/family/[familyGroupId]/fee-pdf": [
      "./public/fonts/**",
      "./public/branding/icon-192.png",
    ],
    "/protected/receipts/[receiptId]/pdf": [
      "./public/fonts/**",
      "./public/branding/icon-192.png",
    ],
    "/api/service/documents": ["./public/fonts/**", "./public/branding/icon-192.png"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // Vercel serves everything in public/ with a revalidate-on-every-request
  // default, so the installed app re-checked its own icons on every launch.
  // These four are the only public assets a browser actually fetches; the
  // Devanagari TTFs under public/fonts are read off disk by @react-pdf on the
  // server and never travel to a client.
  async headers() {
    return [
      {
        // Not `immutable`: the school mark is replaceable, and a year-long
        // immutable cache would strand a replacement on every installed device.
        source: "/branding/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
      {
        // A stale service worker is the worst thing in this list: it decides
        // what every other request does. Browsers already bypass the HTTP cache
        // for the worker script, but say it out loud.
        source: "/service-worker.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
  experimental: {
    // Only packages that are actually installed. react-dialog / react-select /
    // react-sheet were listed here but have never been dependencies — dialogs
    // and sheets are hand-rolled in components/ui to keep the bundle small.
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-slot",
      "@radix-ui/react-tabs",
      "class-variance-authority",
      "next-intl",
      "next-themes",
    ],
    optimizeCss: true,
    scrollRestoration: true,
    // Lets a Link opt in (`unstable_dynamicOnHover`) to fetching the FULL
    // page -- data included -- on hover or touchstart, instead of only its
    // loading skeleton. The phone's tab bar uses it: the 50-100ms between a
    // thumb landing and the click firing is spent rendering the destination,
    // and the entry then lives for staleTimes.dynamic. Only the four tabs
    // opt in; a desktop sidebar hovered in passing would be a server render
    // per pass.
    dynamicOnHover: true,
    // The client Router Cache. `dynamic` ships as 0, which means a page you
    // were looking at ten seconds ago is refetched in full when you come back
    // to it -- and because every route here is force-dynamic (see
    // docs/design/design-system.md §5.6), "in full" is a complete server
    // render: auth, fee policy, shell pulse, page data.
    //
    // In Next 16 this number does two things. It is how long a page you have
    // already seen is kept for an instant return (the router's back/forward
    // cache), and it is the stale header on every dynamic response, so a
    // prefetched loading skeleton lives this long too. It is the single
    // biggest lever for "switching tabs feels instant" on a phone.
    //
    // 60s is safe for money because a posting is a Server Action and
    // revalidatePath purges this cache outright -- the cashier who posted
    // never sees a pre-receipt figure -- and because a colleague's posting
    // reaches every open screen through OfficeSyncListener, whose
    // router.refresh() invalidates this cache within about two seconds. The
    // number bounds the worst case only: a screen nobody is looking at, on a
    // device the realtime channel has dropped, against a server-side ceiling
    // of 300s that the dashboard already runs on
    // (DASHBOARD_STALENESS_CEILING_SECONDS).
    //
    // `static` is the Next default restated, so a future default change is a
    // visible edit here rather than a silent behaviour swing. Note that a
    // default prefetch (Link without `prefetch`, and router.prefetch) fetches
    // only the route tree and loading.tsx of a dynamic route, never its data.
    staleTimes: {
      dynamic: 60,
      static: 300,
    },
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withSentryConfig(
  withBundleAnalyzer(withNextIntl(nextConfig)),
  {
    org: "veer-patta-school",
    project: "schoolfees",

    // EU data region — your Sentry org lives on de.sentry.io.
    sentryUrl: "https://de.sentry.io/",

    // Auth token for uploading source maps (readable stack traces).
    // Set SENTRY_AUTH_TOKEN in Vercel + CI. If absent, the build still
    // succeeds — it just skips the source-map upload.
    authToken: process.env.SENTRY_AUTH_TOKEN,

    // Upload a wider set of source maps for nicer stack traces.
    widenClientFileUpload: true,

    // Only print upload logs in CI.
    silent: !process.env.CI,

    webpack: {
      // Strip Sentry SDK logger statements from the client bundle.
      treeshake: {
        removeDebugLogging: true,
      },
      // Auto-instrument Vercel Cron Monitors (you have crons in vercel.json).
      automaticVercelMonitors: true,
    },
  },
);
