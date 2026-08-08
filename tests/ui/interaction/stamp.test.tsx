import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Stamp } from "@/components/ui/stamp";

describe("Stamp", () => {
  it("renders its label", () => {
    render(<Stamp variant="paid">PAID</Stamp>);
    expect(screen.getByText("PAID")).toBeInTheDocument();
  });

  // The same fact is always stated in the surrounding text, so announcing the
  // stamp too would just repeat it.
  it("is decorative and hidden from screen readers", () => {
    const { container } = render(<Stamp variant="year-cleared">YEAR CLEARED</Stamp>);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  // The five copy-pasted stamps this replaced hard-coded hsl(151 45% 32%) and so
  // rendered near-black on a dark page. Theme variables are the whole point.
  it("uses theme colour variables, never hard-coded hsl literals", () => {
    const { container } = render(<Stamp variant="paid">PAID</Stamp>);
    const className = container.firstElementChild?.getAttribute("class") ?? "";

    expect(className).not.toMatch(/hsl\(/);
    expect(className).toContain("text-success-soft-foreground");
  });

  it("keeps print ink dark so a stamp survives photocopying", () => {
    const { container } = render(<Stamp variant="paid">PAID</Stamp>);
    const className = container.firstElementChild?.getAttribute("class") ?? "";

    expect(className).toContain("print:text-black");
    expect(className).toContain("print:border-black");
  });

  it("sits askew by default and can be squared up for inline use", () => {
    const { container: tilted } = render(<Stamp variant="paid">PAID</Stamp>);
    expect(tilted.firstElementChild).toHaveStyle({ transform: "rotate(-7deg)" });

    const { container: square } = render(
      <Stamp variant="paid" rotate={0}>
        PAID
      </Stamp>,
    );
    expect(square.firstElementChild).toHaveStyle({ transform: "rotate(0deg)" });
  });

  it.each([
    ["paid", "text-success-soft-foreground"],
    ["year-cleared", "bg-success-soft"],
    ["void", "text-destructive"],
    ["draft", "text-muted-foreground"],
    ["advance", "bg-accent-soft"],
    ["closed-as-discount", "bg-warning-soft"],
  ] as const)("styles the %s variant distinctly", (variant, expected) => {
    const { container } = render(<Stamp variant={variant}>X</Stamp>);
    expect(container.firstElementChild?.getAttribute("class")).toContain(expected);
  });
});
