import { describe, expect, it } from "vitest";

import {
  ALL_CAMPAIGNS,
  noticeValuesFrom,
  type NoticeSubject,
  type NoticeSettings,
} from "@/modules/whatsapp/domain/campaigns";
import { missingFactsFor, type CandidateFacts } from "@/modules/whatsapp/domain/fee-reminders";
import type { LateFeeSource } from "@/modules/whatsapp/domain/late-fee";

/**
 * Every message that can actually leave this app, built through the REAL path.
 *
 * `tests/unit/whatsapp-campaigns.test.ts` already checks the slot COUNT against
 * one fixed value set. This file checks the thing that fixed set cannot: what
 * happens when a family is missing something, in both late-fee modes, on all
 * twenty-four campaigns.
 *
 * It matters because **WhatsApp rejects an empty template parameter.** An empty
 * slot is not a message that goes out looking odd — AiSensy answers 400 and the
 * family is never reached, which surfaces as "N failed" on a run and nothing
 * about why. `formatDdMmYyyy(null)` returns `""` and goes straight into
 * `templateParams`; so does an absent `prevSessionLabel`.
 */

/** A family who has everything a notice could ask about. */
const FULL: NoticeSubject = {
  parentName: "Ramesh Lal Gurjar",
  studentName: "Aaradhya Gurjar",
  studentClass: "Class 2",
  dueAmount: 9125,
  totalPaid: 1100,
  balanceDue: 13250,
  prevYearBalance: 20000,
  prevSessionLabel: "2025-26",
  lateFeeApplied: 2000,
  lateFeeInstallments: [1, 2],
  overdueInstallments: [1, 2],
  promisedOn: "2026-09-20",
  promiseContactedOn: "2026-09-10",
};

/**
 * A family the ledger has nothing extra for — no late fee, no promise, no
 * carry-forward. This is the ordinary shape of somebody on the fee-due list,
 * and it is what the office pointed the recovery templates at.
 */
const SPARSE: NoticeSubject = {
  parentName: "Suresh Sharma",
  studentName: "Bhavya Sharma",
  studentClass: "Class 5",
  dueAmount: 9000,
  totalPaid: 0,
  balanceDue: 9000,
  prevYearBalance: 0,
  prevSessionLabel: null,
  lateFeeApplied: 0,
  lateFeeInstallments: [],
  overdueInstallments: [],
  promisedOn: null,
  promiseContactedOn: null,
};

/** `CandidateFacts` for SPARSE, so the guard can be asked about the same family. */
const SPARSE_FACTS: CandidateFacts = {
  totalPaid: 0,
  installmentPending: [5000, 4000, 0, 0],
  lateFeeApplied: 0,
  ledgerFeesPending: 0,
  lateFeeByInstallment: [0, 0, 0, 0],
  ledgerFeesByInstallment: [0, 0, 0, 0],
  overdueInstallments: [],
  overdueAmount: 0,
  nextInstallmentNo: null,
  nextInstallmentPending: 0,
  balanceDue: 9000,
  prevYearBalance: 0,
  promisedOn: null,
  promiseOpen: false,
  promiseDueSoon: false,
  promiseLapsed: false,
};

const MODES: readonly LateFeeSource[] = ["ledger", "custom"];

function settingsFor(
  campaign: (typeof ALL_CAMPAIGNS)[number],
  lateFeeSource: LateFeeSource,
): NoticeSettings {
  return {
    situation: campaign.situation,
    language: campaign.language,
    installments: [1, 2],
    lastDate: "20-09-2026",
    lateFeeAmount: 4000,
    lateFeeBasis: "per_installment",
    lateFeeSource,
    policyLateFeeAmount: 1000,
  };
}

/** Empty or whitespace-only — both are refused by the provider. */
function blankSlots(params: string[], slotOrder: readonly string[]): string[] {
  return params
    .map((value, index) => ({ slot: slotOrder[index] ?? `#${index + 1}`, value }))
    .filter((entry) => String(entry.value ?? "").trim() === "")
    .map((entry) => entry.slot);
}

const CASES = ALL_CAMPAIGNS.flatMap((campaign) =>
  MODES.map((mode) => ({ campaign, mode, id: `${campaign.campaignName} · ${mode}` })),
);

describe("every sendable message, both late-fee modes", () => {
  it.each(CASES.map((entry) => [entry.id, entry] as const))(
    "%s fills every slot for a family who has everything",
    (_id, { campaign, mode }) => {
      const params = campaign.buildParams(noticeValuesFrom(FULL, settingsFor(campaign, mode)));

      expect(params).toHaveLength(campaign.slotOrder.length);
      expect(blankSlots(params, campaign.slotOrder)).toEqual([]);
    },
  );

  it.each(CASES.map((entry) => [entry.id, entry] as const))(
    "%s keeps the slot count for a family the ledger has nothing extra for",
    (_id, { campaign, mode }) => {
      // A wrong COUNT is refused as "Template params does not match the
      // campaign" whatever the values are, so it must hold for any family.
      const params = campaign.buildParams(noticeValuesFrom(SPARSE, settingsFor(campaign, mode)));
      expect(params).toHaveLength(campaign.slotOrder.length);
    },
  );

  /**
   * The invariant that matters most, and the one the office actually hit.
   *
   * If a message CAN render an empty slot for a family, `missingFactsFor` must
   * already know — because that guard is the only thing standing between the
   * office and a run that reports failures with no explanation. A slot that can
   * go out empty while the guard says nothing is a silent send failure.
   */
  it.each(CASES.map((entry) => [entry.id, entry] as const))(
    "%s never renders a blank slot the fact guard did not warn about",
    (_id, { campaign, mode }) => {
      const values = noticeValuesFrom(SPARSE, settingsFor(campaign, mode));
      const params = campaign.buildParams(values);
      const blanks = blankSlots(params, campaign.slotOrder);

      if (blanks.length === 0) return;

      const warned = missingFactsFor(
        campaign.situation,
        SPARSE_FACTS,
        SPARSE.dueAmount,
        mode,
      );

      expect(
        warned.length,
        `${campaign.campaignName} in ${mode} mode renders blank slot(s) ${blanks.join(
          ", ",
        )} and the fact guard reported nothing — WhatsApp would refuse the message and the run would show an unexplained failure`,
      ).toBeGreaterThan(0);
    },
  );
});
