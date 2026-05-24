import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";

import { ServiceWorkerRegistration } from "@/components/system/service-worker-registration";
import { ThemeProvider } from "@/components/system/theme-provider";
import { ToastViewport } from "@/components/ui/toast";
import { DensityProvider } from "@/lib/design/density-context";
import { schoolProfile } from "@/lib/config/school";
import { getSiteUrl } from "@/lib/env";

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

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${fontDisplay.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased">
        <ThemeProvider>
          <DensityProvider>
            {children}
            <ToastViewport />
          </DensityProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
