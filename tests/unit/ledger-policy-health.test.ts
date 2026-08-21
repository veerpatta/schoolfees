import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCacheSafeClient = vi.fn();
vi.mock("@/platform/supabase/cache-safe", () => ({ getCacheSafeClient }));

type DriftRow = {
  drift: number;
  has_ledger: boolean;
  stale_class_rows: number;
  stale_class_locked_rows: number;
};

function mockRows(rows: DriftRow[] | { error: string }) {
  getCacheSafeClient.mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve(
            "error" in rows
              ? { data: null, error: { message: rows.error } }
              : { data: rows, error: null },
          ),
      }),
    }),
  });
}

function row(overrides: Partial<DriftRow> = {}): DriftRow {
  return {
    drift: 0,
    has_ledger: true,
    stale_class_rows: 0,
    stale_class_locked_rows: 0,
    ...overrides,
  };
}

/**
 * The Settings panel's only DATA check.
 *
 * Everything else on that panel is deployment config, which fails loudly. A
 * ledger sitting below its own fee policy fails silently — it looks exactly
 * like a ledger that is paid up — so the counting has to be right or the panel
 * reassures the office about money it never billed.
 */
describe("getLedgerPolicyHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reports healthy when every ledger agrees with policy", async () => {
    mockRows([row(), row(), row()]);

    const { getLedgerPolicyHealth } = await import("@/modules/fees/data/ledger-policy-health");
    const health = await getLedgerPolicyHealth("2026-27");

    expect(health.activeStudents).toBe(3);
    expect(health.healthy).toBe(true);
    expect(health.underBilledAmount).toBe(0);
  });

  it("separates under-billing from over-billing", async () => {
    // Opposite failures. drift > 0 is money the school never asked for;
    // drift < 0 is a discount that was decided and never landed, so a family is
    // being asked for more than was agreed. Summing them together would let one
    // cancel the other out and report a clean school.
    mockRows([row({ drift: 13600 }), row({ drift: 10000 }), row({ drift: -2000 })]);

    const { getLedgerPolicyHealth } = await import("@/modules/fees/data/ledger-policy-health");
    const health = await getLedgerPolicyHealth("2026-27");

    expect(health.underBilledStudents).toBe(2);
    expect(health.underBilledAmount).toBe(23600);
    expect(health.overBilledStudents).toBe(1);
    expect(health.overBilledAmount).toBe(2000);
    expect(health.healthy).toBe(false);
  });

  it("counts a student with no ledger as missing dues, not as drifted", async () => {
    // Their whole policy total reads as `drift`, which would otherwise dominate
    // the under-billed figure and describe "dues never prepared" as a billing
    // error. Different condition, different fix.
    mockRows([row({ drift: 25000, has_ledger: false })]);

    const { getLedgerPolicyHealth } = await import("@/modules/fees/data/ledger-policy-health");
    const health = await getLedgerPolicyHealth("2026-27");

    expect(health.studentsWithoutLedger).toBe(1);
    expect(health.underBilledStudents).toBe(0);
    expect(health.underBilledAmount).toBe(0);
    expect(health.healthy).toBe(false);
  });

  it("flags a stale ledger class even when the money is exactly right", async () => {
    // SR 2141: 12 Arts -> 12 Commerce, both classes at Rs 32,000. Nothing to
    // see in the totals, and every per-class board billing the wrong class.
    mockRows([row({ stale_class_rows: 4 })]);

    const { getLedgerPolicyHealth } = await import("@/modules/fees/data/ledger-policy-health");
    const health = await getLedgerPolicyHealth("2026-27");

    expect(health.studentsWithStaleLedgerClass).toBe(1);
    expect(health.healthy).toBe(false);
  });

  it("counts carry-forward and EMI rows separately — regeneration cannot fix them", async () => {
    mockRows([row({ stale_class_locked_rows: 1 })]);

    const { getLedgerPolicyHealth } = await import("@/modules/fees/data/ledger-policy-health");
    const health = await getLedgerPolicyHealth("2026-27");

    expect(health.studentsWithStaleLockedClass).toBe(1);
    expect(health.studentsWithStaleLedgerClass).toBe(0);
    expect(health.healthy).toBe(false);
  });

  it("says the check could not run rather than claiming a clean school", async () => {
    // A database behind the code must not render as "0 students under-billed".
    // Settings is the page people open when something is already wrong.
    mockRows({ error: 'relation "v_ledger_policy_drift" does not exist' });

    const { getLedgerPolicyHealth } = await import("@/modules/fees/data/ledger-policy-health");
    const health = await getLedgerPolicyHealth("2026-27");

    expect(health.unavailableReason).toContain("v_ledger_policy_drift");
    expect(health.healthy).toBe(false);
  });

  it("refuses an empty session label without touching the database", async () => {
    mockRows([]);

    const { getLedgerPolicyHealth } = await import("@/modules/fees/data/ledger-policy-health");
    const health = await getLedgerPolicyHealth("   ");

    expect(health.unavailableReason).toBe("No academic session selected.");
    expect(getCacheSafeClient).not.toHaveBeenCalled();
  });
});
