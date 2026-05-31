// Goes at REPO ROOT: next.config.ts  (REPLACES the existing file)
// Only two things changed vs. your current file:
//   1. added the `withSentryConfig` import
//   2. wrapped the final export with withSentryConfig(...)
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
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
  outputFileTracingIncludes: {
    "/protected/students/[studentId]/fee-pdf": ["./public/fonts/**"],
    "/protected/students/family/[familyGroupId]/fee-pdf": ["./public/fonts/**"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-select",
      "@radix-ui/react-slot",
      "@radix-ui/react-sheet",
      "@radix-ui/react-tabs",
      "class-variance-authority",
      "next-intl",
      "next-themes",
    ],
    optimizeCss: true,
    scrollRestoration: true,
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

    // Strip Sentry SDK logger statements from the client bundle (smaller bundle).
    disableLogger: true,

    // Auto-instrument Vercel Cron Monitors (you have crons in vercel.json).
    automaticVercelMonitors: true,
  },
);
