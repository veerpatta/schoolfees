import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari, Source_Serif_4 } from "next/font/google";
import { getLocale } from "next-intl/server";

import { ServiceWorkerRegistration } from "@/components/system/service-worker-registration";
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
  manifest: "/api/manifest",
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
        <LanguageProvider initialLocale={initialLocale} catalogs={catalogs}>
          <ThemeProvider>
            <DensityProvider>
              {children}
              <ToastViewport />
            </DensityProvider>
          </ThemeProvider>
        </LanguageProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
