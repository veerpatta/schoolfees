import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

function LinkLike({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props}>{children}</a>;
}

describe("button asChild", () => {
  it("keeps the slotted link as the styled element when icons are present", () => {
    const html = renderToStaticMarkup(
      <Button asChild leadingIcon={<span aria-hidden="true">Icon</span>}>
        <LinkLike href="/protected/payments">Payment Desk</LinkLike>
      </Button>,
    );

    expect(html).toContain('<a href="/protected/payments"');
    expect(html).toContain("Payment Desk");
    expect(html).toContain("Icon");
    expect(html).not.toContain("React.Fragment");
  });
});
