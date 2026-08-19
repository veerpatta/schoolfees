import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari, Source_Serif_4 } from "next/font/google";
import { getLocale } from "next-intl/server";

import { ServiceWorkerRegistration } from "@/components/system/service-worker-registration";
import { QualityReporterLoader } from "@/components/quality/quality-reporter-loader";
import { ThemeProvider } from "@/components/system/theme-provider";
import { ToastViewport } from "@/components/ui/toast";
import { DensityProvider } from "@/lib/design/density-context";
import { LanguageProvider, type LanguageCatalogs } from "@/lib/locale/language-provider";
import { schoolProfile } from "@/lib/config/school";
import { getSiteUrl } from "@/lib/env";
import { type AppLocale, isSupportedLocale } from "@/i18n/locales";

import "./globals.css";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const fontDisplay = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

// Devanagari for Hindi script (हिन्दी). Bundled so the first paint in Hindi
// uses a consistent font across devices instead of falling back to whatever
// the OS happens to ship.
const fontDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-devanagari",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

async function loadActiveCatalog(
  locale: AppLocale,
): Promise<LanguageCatalogs> {
  switch (locale) {
    case "en":
      return { en: (await import("@/messages/en.json")).default as Record<string, unknown> };
    case "hi":
      return { hi: (await import("@/messages/hi.json")).default as Record<string, unknown> };
    case "hi-en":
      return { "hi-en": (await import("@/messages/hi-en.json")).default as Record<string, unknown> };
  }
}

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: `${schoolProfile.name} | Fee Admin`,
    template: `%s | ${schoolProfile.shortName}`,
  },
  description:
    "Internal fee management system for Shri Veer Patta Senior Secondary School, built for office and accounts staff.",
  applicationName: `${schoolProfile.shortName} Fee Admin`,
  category: "business",
  keywords: [
    "school fee management",
    "internal admin app",
    "next.js",
    "supabase",
    "school collections",
  ],
  appleWebApp: {
    capable: true,
    title: `${schoolProfile.shortName} Fee Admin`,
    statusBarStyle: "default",
  },
  // No `manifest:` here on purpose -- see the hand-rendered <link> in
  // RootLayout below. Next's Metadata API cannot set crossOrigin on the
  // manifest link, and without it the manifest is fetched without cookies.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF7" },
    { media: "(prefers-color-scheme: dark)", color: "#11131A" },
  ],
};

// Keep the app dynamic at the root so Vercel's Next 16 adapter consistently
// emits lambdas for every App Router page (the deep-smoke and deployment
// configuration guards rely on this). The big P0-2 win from the perf plan —
// shipping only the active locale's catalog instead of all three — is
// preserved via loadActiveCatalog below and the lazy provider import.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // next-intl seeds the initial locale from the vpps_locale cookie via
  // i18n/request.ts. Only the active locale's catalog is shipped on the
  // initial response; LanguageProvider dynamic-imports the other two on the
  // first switch (~2/3 smaller first-load JS).
  const resolvedLocale = await getLocale();
  const initialLocale: AppLocale = isSupportedLocale(resolvedLocale)
    ? resolvedLocale
    : "en";
  const catalogs = await loadActiveCatalog(initialLocale);

  return (
    <html
      lang={initialLocale}
      className={`${fontSans.variable} ${fontDisplay.variable} ${fontDevanagari.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        {/*
          The manifest link is written by hand rather than through
          `metadata.manifest`, for one attribute: crossOrigin.

          A manifest is fetched with credentials omitted unless the link says
          use-credentials, and Next only emits that attribute on Vercel preview
          deployments (lib/metadata/metadata.js, guarded on VERCEL_ENV). So in
          production /api/manifest saw no cookies, getAuthenticatedStaff()
          returned null, and every installed app -- accountant, fee collector,
          teacher -- got the view_only manifest: launched on Dashboard, with no
          Payment Desk shortcut. The route has been role-aware since it was
          written; this is what lets it act on it.

          React 19 hoists <link> into <head>, so it does not need a head block.
        */}
        <link rel="manifest" href="/api/manifest" crossOrigin="use-credentials" />
        <LanguageProvider initialLocale={initialLocale} catalogs={catalogs}>
          <ThemeProvider>
            <DensityProvider>
              {children}
              <ToastViewport />
            </DensityProvider>
          </ThemeProvider>
        </LanguageProvider>
        <QualityReporterLoader />
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
