import type { Metadata } from "next";

import { schoolProfile } from "@/lib/config/school";
import { getSiteUrl } from "@/lib/env";

import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
