import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

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

import { WhatsAppDraftModal } from "@/components/defaulters/whatsapp-draft-modal";

const messages = JSON.parse(
  readFileSync(join(process.cwd(), "messages", "en.json"), "utf-8"),
);

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const BASE_ROW = {
  fullName: "Arjun Singh",
  classLabel: "Class 10-A",
  totalPending: 12000,
  overdueAmount: 0,
  oldestDueDate: "2026-04-20",
};

describe("WhatsAppDraftModal", () => {
  it("renders the student name in the sheet description", () => {
    const html = render(
      <WhatsAppDraftModal row={BASE_ROW} open={true} onClose={vi.fn()} />,
    );
    expect(html).toContain("Arjun Singh");
  });

  it("renders the title 'WhatsApp draft'", () => {
    const html = render(
      <WhatsAppDraftModal row={BASE_ROW} open={true} onClose={vi.fn()} />,
    );
    expect(html).toContain("WhatsApp draft");
  });

  it("includes the student name in the draft text", () => {
    const html = render(
      <WhatsAppDraftModal row={BASE_ROW} open={true} onClose={vi.fn()} />,
    );
    expect(html).toContain("Arjun Singh");
  });

  it("includes the formatted pending amount in the draft", () => {
    const html = render(
      <WhatsAppDraftModal row={BASE_ROW} open={true} onClose={vi.fn()} />,
    );
    expect(html).toContain("12,000");
  });

  it("includes the school short name in the draft", () => {
    const html = render(
      <WhatsAppDraftModal row={BASE_ROW} open={true} onClose={vi.fn()} />,
    );
    // schoolProfile.shortName = "Shri Veer Patta SSS"
    expect(html).toContain("Veer Patta");
  });

  it("renders a copy to clipboard button", () => {
    const html = render(
      <WhatsAppDraftModal row={BASE_ROW} open={true} onClose={vi.fn()} />,
    );
    expect(html).toContain("Copy to clipboard");
  });

  it("renders overdue label when overdueAmount > 0", () => {
    const html = render(
      <WhatsAppDraftModal
        row={{ ...BASE_ROW, overdueAmount: 6000 }}
        open={true}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Overdue");
  });

  it("renders the oldest due date label when no overdue amount", () => {
    const html = render(
      <WhatsAppDraftModal row={BASE_ROW} open={true} onClose={vi.fn()} />,
    );
    expect(html).toContain("Due 2026-04-20");
  });

  it("renders 'Total dues' label when no overdue amount and no oldestDueDate", () => {
    const html = render(
      <WhatsAppDraftModal
        row={{ ...BASE_ROW, oldestDueDate: null }}
        open={true}
        onClose={vi.fn()}
      />,
    );
    expect(html).toContain("Total dues");
  });

  it("includes disclaimer about not sending messages", () => {
    const html = render(
      <WhatsAppDraftModal row={BASE_ROW} open={true} onClose={vi.fn()} />,
    );
    expect(html).toContain("does not send");
  });
});
