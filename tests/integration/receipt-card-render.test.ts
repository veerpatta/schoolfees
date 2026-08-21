import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The 1080x1080 WhatsApp card is rendered by Satori, which throws at render
 * time when an element has more than one child node and no explicit `display`.
 * Next surfaces that as "failed to pipe response" (SCHOOLFEES-J), so the route
 * answered every request with a 500 from the moment a UI first linked to it.
 *
 * Reading the JSX is not enough to catch it -- `{a} · {b}` looks like one line
 * and is three child nodes. So this renders the real route and checks the bytes
 * are a PNG, across the branches that change the tree.
 */

vi.mock("@/platform/supabase/session", () => ({
  requireStaffPermission: vi.fn().mockResolvedValue({ id: "staff-1" }),
}));

const getReceiptDetail = vi.fn();
vi.mock("@/modules/receipts/data/queries", () => ({
  getReceiptDetail: (...args: unknown[]) => getReceiptDetail(...args),
}));

const baseReceipt = {
  receiptNumber: "SVP/2026-27/00123",
  studentFullName: "Aaradhya Devi Chaudhary",
  classLabel: "Class 8 - A",
  paymentDate: "2026-08-18",
  totalAmount: 12500,
  totalDue: 38000,
  totalPaidToDate: 24500,
  currentOutstanding: 13500,
  isVoided: false,
  breakdown: [
    { installmentLabel: "Installment 1" },
    { installmentLabel: "Installment 2" },
  ],
};

const cases: Array<[string, Record<string, unknown>]> = [
  ["a normal part-paid receipt", {}],
  ["a reversed receipt", { isVoided: true }],
  ["a receipt that clears all dues", { currentOutstanding: 0, totalPaidToDate: 38000 }],
  ["a receipt with no installment breakdown", { breakdown: [] }],
  ["a student with nothing owed yet", { totalDue: 0, totalPaidToDate: 0, currentOutstanding: 0 }],
  ["a long name and a long class label", {
    studentFullName: "Lakshmi Priyadarshini Venkataraghavan Subramanian",
    classLabel: "Class 12 Science - Section B",
  }],
];

describe("receipt card image", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL ||= "https://schoolfees-two.vercel.app";
    getReceiptDetail.mockReset();
  });

  it.each(cases)("renders a PNG for %s", async (_label, overrides) => {
    getReceiptDetail.mockResolvedValue({ ...baseReceipt, ...overrides });
    const { GET } = await import("@/app/protected/receipts/[receiptId]/card/route");

    const res = await GET(new Request("http://localhost/card"), {
      params: Promise.resolve({ receiptId: "47bfe539-81ee-4c90-8ac9-d62265ff4232" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(bytes.length).toBeGreaterThan(1000);
  }, 30000);

  it("rejects a receipt id that is not a uuid without rendering", async () => {
    const { GET } = await import("@/app/protected/receipts/[receiptId]/card/route");
    const res = await GET(new Request("http://localhost/card"), {
      params: Promise.resolve({ receiptId: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
    expect(getReceiptDetail).not.toHaveBeenCalled();
  });

  it("404s when the receipt does not exist", async () => {
    getReceiptDetail.mockResolvedValue(null);
    const { GET } = await import("@/app/protected/receipts/[receiptId]/card/route");
    const res = await GET(new Request("http://localhost/card"), {
      params: Promise.resolve({ receiptId: "47bfe539-81ee-4c90-8ac9-d62265ff4232" }),
    });
    expect(res.status).toBe(404);
  });
});
