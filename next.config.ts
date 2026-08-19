import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

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
    // The client Router Cache. `dynamic` ships as 0, which means a page you
    // were looking at ten seconds ago is refetched in full when you come back
    // to it -- and because every route here is force-dynamic (see
    // docs/design/design-system.md §5.6), "in full" is a complete server
    // render: auth, users lookup, fee policy, shell pulse, page data.
    //
    // 30s is safe for money because a posting is a Server Action and
    // revalidatePath purges this cache outright -- the cashier who posted
    // never sees a pre-receipt figure. What 30s buys is a colleague's posting
    // taking up to half a minute to appear on a re-visit, against a
    // server-side ceiling of 300s that the dashboard already runs on
    // (DASHBOARD_STALENESS_CEILING_SECONDS).
    //
    // `static` is the Next default restated, so a future default change is a
    // visible edit here rather than a silent behaviour swing. It governs
    // router.prefetch() results, which is what the sidebar warms on idle.
    staleTimes: {
      dynamic: 30,
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
