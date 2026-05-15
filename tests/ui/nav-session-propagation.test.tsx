import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const navigationState = vi.hoisted(() => ({
  searchParams: new URLSearchParams("session=2025-26"),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/protected/dashboard",
  useSearchParams: () => navigationState.searchParams,
}));

describe("session-aware navigation", () => {
  it("appends the current session to every protected sidebar link", async () => {
    const { SidebarNav } = await import("@/components/admin/sidebar-nav");

    const html = renderToStaticMarkup(<SidebarNav staffRole="admin" />);
    const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g)).map((match) => match[1]);
    const protectedHrefs = hrefs.filter((href) => href.startsWith("/protected/"));

    expect(protectedHrefs.length).toBeGreaterThan(0);
    expect(protectedHrefs.every((href) => href.includes("session=2025-26"))).toBe(true);
  });
});
