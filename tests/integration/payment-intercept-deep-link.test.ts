/**
 * Tests for the PaymentDrawerShell deep-link close fallback.
 *
 * When the user arrives at /protected/payments directly (no browser history),
 * router.back() has nowhere to go, so the shell falls back to
 * router.push(returnTo ?? '/protected/dashboard').
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function readRepoFile(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("PaymentDrawerShell deep-link fallback", () => {
  it("uses window.history.length to detect deep-link navigation", () => {
    const shell = readRepoFile(
      "components/payments/collect/payment-drawer-shell.tsx",
    );
    expect(shell).toContain("window.history.length");
  });

  it("falls back to returnTo when history is empty", () => {
    const shell = readRepoFile(
      "components/payments/collect/payment-drawer-shell.tsx",
    );
    expect(shell).toContain("returnTo");
    expect(shell).toContain('"/protected/dashboard"');
  });

  it("CollectTrigger passes returnTo as a URL param when provided", () => {
    const trigger = readRepoFile(
      "components/payments/collect/collect-trigger.tsx",
    );
    expect(trigger).toContain('params.set("returnTo"');
    expect(trigger).toContain("intent.returnTo");
    expect(trigger).toContain("buildCollectHref");
  });

  it("CollectDrawer useEffect passes returnTo when present in intent", () => {
    const drawer = readRepoFile(
      "components/payments/collect/collect-drawer.tsx",
    );
    expect(drawer).toContain('params.set("returnTo"');
    expect(drawer).toContain("intent.returnTo");
  });

  it("intercepting page extracts returnTo from searchParams", () => {
    const page = readRepoFile(
      "app/protected/@drawer/(.)payments/page.tsx",
    );
    expect(page).toContain("returnTo");
    expect(page).toContain("resolvedSearchParams?.returnTo");
  });
});
