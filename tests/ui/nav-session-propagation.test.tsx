import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

const navigationState = vi.hoisted(() => ({
  searchParams: new URLSearchParams("session=2025-26"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/protected/dashboard",
  useSearchParams: () => navigationState.searchParams,
  useRouter: () => ({
    prefetch: () => {},
    push: () => {},
    replace: () => {},
    back: () => {},
    forward: () => {},
    refresh: () => {},
  }),
}));

function loadEnglishMessages() {
  return JSON.parse(
    readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
  );
}

describe("session-aware navigation", () => {
  it("appends the current session to every protected sidebar link", async () => {
    const { SidebarNav } = await import("@/components/admin/sidebar-nav");
    const messages = loadEnglishMessages();

    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SidebarNav staffRole="admin" />
      </NextIntlClientProvider>,
    );
    const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g)).map((match) => match[1]);
    const protectedHrefs = hrefs.filter((href) => href.startsWith("/protected/"));

    expect(protectedHrefs.length).toBeGreaterThan(0);
    expect(protectedHrefs.every((href) => href.includes("session=2025-26"))).toBe(true);
  });
});
