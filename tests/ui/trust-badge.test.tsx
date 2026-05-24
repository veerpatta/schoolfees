import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TrustBadge } from "@/components/trust/trust-badge";

describe("TrustBadge — SSR contract", () => {
  it("renders the source label", () => {
    const html = renderToStaticMarkup(<TrustBadge source="Workbook v1" />);
    expect(html).toContain("Workbook v1");
  });

  it("does not render relative time on initial paint (hydration safety)", () => {
    const html = renderToStaticMarkup(
      <TrustBadge source="Live" computedAt="2026-05-24T05:00:00.000Z" />,
    );
    // The relative-time chunk only appears after mount; the initial HTML
    // should not contain it. We assert by absence of the "·" separator.
    expect(html).not.toContain("·");
  });

  it("exposes a tooltip-style title with the source", () => {
    const html = renderToStaticMarkup(<TrustBadge source="Daily snapshot" />);
    expect(html).toContain("Source: Daily snapshot");
  });

  it("renders an audit chevron when auditHref is supplied", () => {
    const html = renderToStaticMarkup(
      <TrustBadge source="Live" auditHref="/protected/admin-tools/audit?recordId=abc" />,
    );
    expect(html).toContain("Open audit trail");
  });
});
