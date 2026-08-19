import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/messages/en.json";
import { ShareReceiptWhatsApp } from "@/components/receipts/share-receipt-whatsapp";

/**
 * The one-tap send, as staff meet it.
 *
 * Everything here is about what leaves the building: which files get attached,
 * whether the message survives, and whether a reversed receipt can go out
 * looking like a payment confirmation. jsdom has no `navigator.share`, so it is
 * installed per test — which is also how the fallback path gets exercised.
 */

const RECEIPT = {
  id: "receipt-uuid",
  receiptNumber: "SVP20260819-0012",
  studentFullName: "TEST Aarav Sharma",
  fatherName: "TEST Rakesh Sharma",
  classLabel: "Class 8 A",
  totalAmount: 12000,
  fatherPhone: "9876543210",
  motherPhone: "9876500000",
};

const shareSpy = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

function installShare({ canShare }: { canShare: ((data: ShareData) => boolean) | null }) {
  Object.defineProperty(navigator, "share", { value: shareSpy, configurable: true });
  if (canShare) {
    Object.defineProperty(navigator, "canShare", { value: canShare, configurable: true });
  } else {
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  }
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

function Harness(props: Partial<React.ComponentProps<typeof ShareReceiptWhatsApp>> = {}) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Kolkata">
      <ShareReceiptWhatsApp
        open
        onOpenChange={() => {}}
        receipt={RECEIPT}
        canSendReceiptPdf
        {...props}
      />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  shareSpy.mockReset().mockResolvedValue(undefined);
  writeText.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(["x"]),
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sending a receipt to the parent", () => {
  it("fetches both documents as soon as the sheet opens, not on the tap", () => {
    // The fetch has to be done before the click: awaiting inside the handler
    // consumes the user activation iOS requires and the share is refused.
    installShare({ canShare: () => true });
    render(<Harness />);

    const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(urls).toContain("/protected/receipts/receipt-uuid/card");
    expect(urls).toContain("/protected/receipts/receipt-uuid/pdf");
  });

  it("asks only for the card when the role cannot print", () => {
    installShare({ canShare: () => true });
    render(<Harness canSendReceiptPdf={false} />);

    const urls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0],
    );
    expect(urls).toContain("/protected/receipts/receipt-uuid/card");
    expect(urls).not.toContain("/protected/receipts/receipt-uuid/pdf");
  });

  it("shares both files and copies the message", async () => {
    installShare({ canShare: () => true });
    render(<Harness />);

    const send = await screen.findByRole("button", { name: /send on whatsapp/i });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);

    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const shared = shareSpy.mock.calls[0][0] as ShareData;
    expect(shared.files).toHaveLength(2);
    // Copied regardless: WhatsApp drops the text of a multi-file share, and a
    // receipt arriving with no words is worse than one arriving with them.
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("SVP20260819-0012"));
  });

  it("keeps the image when the browser will only take one file", async () => {
    installShare({ canShare: (data) => (data.files ?? []).length === 1 });
    render(<Harness />);

    const send = await screen.findByRole("button", { name: /send on whatsapp/i });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);

    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const shared = shareSpy.mock.calls[0][0] as ShareData;
    expect(shared.files).toHaveLength(1);
    expect(shared.files?.[0].type).toBe("image/png");
  });

  it("offers download plus a number picker when files cannot be shared", async () => {
    // Desktop Chrome: navigator.share exists, but it refuses files.
    installShare({ canShare: () => false });
    render(<Harness />);

    const send = await screen.findByRole("button", { name: /send on whatsapp/i });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);

    expect(shareSpy).not.toHaveBeenCalled();
    await screen.findByText(/download the pdf, then open whatsapp/i);
    expect(await screen.findByRole("button", { name: /open whatsapp/i })).toBeVisible();
  });

  it("lists both parents' numbers so the sender can pick", async () => {
    installShare({ canShare: () => true });
    render(<Harness />);

    expect(await screen.findByText("9876543210")).toBeVisible();
    expect(await screen.findByText("9876500000")).toBeVisible();
  });
});

describe("a reversed receipt", () => {
  const reversed = { ...RECEIPT, isVoided: true };

  it("cannot be sent until the warning is acknowledged", async () => {
    installShare({ canShare: () => true });
    render(<Harness receipt={reversed} />);

    await screen.findByText(/this receipt has been reversed/i);
    const send = screen.getByRole("button", { name: /send on whatsapp/i });

    // Prepared, but still refused: the block is the caution, not the fetch.
    // The label appears in both the contents list and the download links.
    await waitFor(() =>
      expect(screen.getAllByText(/receipt card \(image\)/i).length).toBeGreaterThan(0),
    );
    expect(send).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: /send the reversal notice/i }),
    );

    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);
    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
  });

  it("sends a reversal notice even when the desk supplied a confirmation", async () => {
    installShare({ canShare: () => true });
    render(
      <Harness
        receipt={reversed}
        messageOverride="We have received your payment. Thank you!"
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /send the reversal notice/i }),
    );
    const send = screen.getByRole("button", { name: /send on whatsapp/i });
    await waitFor(() => expect(send).toBeEnabled());
    await userEvent.click(send);

    await waitFor(() => expect(shareSpy).toHaveBeenCalledTimes(1));
    const shared = shareSpy.mock.calls[0][0] as ShareData;
    expect(shared.text).toContain("REVERSED");
    expect(shared.text).not.toMatch(/received/i);
  });
});
