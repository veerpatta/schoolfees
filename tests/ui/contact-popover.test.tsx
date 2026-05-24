import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Sheet uses createPortal and document — skip its internals for SSR tests.
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, title, description }: {
    children: React.ReactNode;
    title?: string;
    description?: string;
    open?: boolean;
    onClose?: () => void;
    size?: string;
  }) =>
    React.createElement("div", { "data-testid": "sheet" },
      title ? React.createElement("h3", null, title) : null,
      description ? React.createElement("p", null, description) : null,
      children,
    ),
}));

vi.mock("@/app/protected/defaulters/actions", () => ({
  logContactAction: vi.fn(),
}));

// useActionState is not available in the SSR test environment for server actions.
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return {
    ...actual,
    useActionState: (action: unknown, initial: unknown) => [initial, action, false],
  };
});

import { ContactPopover } from "@/components/defaulters/contact-popover";

describe("ContactPopover", () => {
  const BASE_PROPS = {
    studentId: "student-001",
    studentName: "Arjun Singh",
    sessionLabel: "2026-27",
    open: true,
    onClose: vi.fn(),
  };

  it("renders the student name in the sheet description", () => {
    const html = renderToStaticMarkup(<ContactPopover {...BASE_PROPS} />);
    expect(html).toContain("Arjun Singh");
  });

  it("renders all five channel options", () => {
    const html = renderToStaticMarkup(<ContactPopover {...BASE_PROPS} />);
    expect(html).toContain("Phone call");
    expect(html).toContain("WhatsApp");
    expect(html).toContain("SMS");
    expect(html).toContain("In person");
    expect(html).toContain("Email");
  });

  it("renders all five outcome options", () => {
    const html = renderToStaticMarkup(<ContactPopover {...BASE_PROPS} />);
    expect(html).toContain("Reached");
    expect(html).toContain("No answer");
    expect(html).toContain("Promised to pay");
    expect(html).toContain("Dispute");
    expect(html).toContain("Other");
  });

  it("renders the snooze dropdown", () => {
    const html = renderToStaticMarkup(<ContactPopover {...BASE_PROPS} />);
    expect(html).toContain("Snooze follow-up");
    expect(html).toContain("No snooze");
    expect(html).toContain("1 week");
  });

  it("includes hidden fields for studentId and sessionLabel", () => {
    const html = renderToStaticMarkup(<ContactPopover {...BASE_PROPS} />);
    expect(html).toContain('name="studentId"');
    expect(html).toContain('value="student-001"');
    expect(html).toContain('name="sessionLabel"');
    expect(html).toContain('value="2026-27"');
  });

  it("renders submit button", () => {
    const html = renderToStaticMarkup(<ContactPopover {...BASE_PROPS} />);
    expect(html).toContain("Log contact");
  });
});
