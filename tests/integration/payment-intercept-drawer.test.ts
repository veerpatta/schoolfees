/**
 * Structural tests for the @drawer intercepting-route payment sheet.
 *
 * These tests verify that the parallel slot wiring is in place and the
 * drawer shell has the correct shape — without requiring a full Next.js
 * server render.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("@drawer intercepting route — structural wiring", () => {
  it("creates the null default slot so non-payments routes render nothing", () => {
    expect(
      existsSync(join(process.cwd(), "app/protected/@drawer/default.tsx")),
    ).toBe(true);
    const content = readRepoFile("app/protected/@drawer/default.tsx");
    expect(content).toContain("DrawerSlotDefault");
    expect(content).toContain("return null");
  });

  it("creates the intercepting payments page inside @drawer", () => {
    expect(
      existsSync(
        join(process.cwd(), "app/protected/@drawer/(.)payments/page.tsx"),
      ),
    ).toBe(true);
  });

  it("intercepting page wraps content in PaymentDrawerShell", () => {
    const page = readRepoFile(
      "app/protected/@drawer/(.)payments/page.tsx",
    );
    expect(page).toContain("PaymentDrawerShell");
    expect(page).toContain("PaymentEntryClient");
  });

  it("intercepting page reads returnTo from searchParams and passes it to shell", () => {
    const page = readRepoFile(
      "app/protected/@drawer/(.)payments/page.tsx",
    );
    expect(page).toContain("returnTo");
    expect(page).toContain("searchParams");
  });

  it("intercepting page requires payments:view permission", () => {
    const page = readRepoFile(
      "app/protected/@drawer/(.)payments/page.tsx",
    );
    expect(page).toContain('requireStaffPermission("payments:view"');
  });

  it("PaymentDrawerShell is a client component with a close handler", () => {
    const shell = readRepoFile(
      "components/payments/collect/payment-drawer-shell.tsx",
    );
    expect(shell).toContain('"use client"');
    expect(shell).toContain("router.back()");
    expect(shell).toContain("Sheet");
  });

  it("protected layout passes the drawer slot to DashboardShell", () => {
    const layout = readRepoFile("app/protected/layout.tsx");
    expect(layout).toContain("drawer");
    expect(layout).toContain("React.ReactNode");
    expect(layout).toContain("{drawer}");
  });

  it("CollectDrawer is now a fire-and-navigate bridge that returns null", () => {
    const drawer = readRepoFile(
      "components/payments/collect/collect-drawer.tsx",
    );
    expect(drawer).toContain("return null");
    expect(drawer).toContain("useEffect");
    expect(drawer).toContain("router.push");
    expect(drawer).not.toContain('"Open Payment Desk"');
  });

  it("CollectTrigger navigates directly via Link without useCollect", () => {
    const trigger = readRepoFile(
      "components/payments/collect/collect-trigger.tsx",
    );
    expect(trigger).toContain("buildCollectHref");
    expect(trigger).toContain('from "next/link"');
    expect(trigger).not.toContain("useCollect()");
    expect(trigger).not.toContain("const { open }");
  });
});
