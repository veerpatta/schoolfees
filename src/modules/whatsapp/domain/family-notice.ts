import {
  describeFamilyCampaign,
  type FamilyCampaignDescriptor,
  type FamilyNoticeValues,
} from "@/modules/whatsapp/domain/campaign-bodies-v3";
import {
  campaignNameFor,
  type NoticeLanguage,
  type NoticeSituation,
} from "@/modules/whatsapp/domain/campaigns";
import type { ReminderFamily } from "@/modules/whatsapp/domain/family-grouping";
import { lateFeePhrase, type LateFeeBasis } from "@/modules/whatsapp/domain/late-fee";

/**
 * Which message a family gets: the one that names all their children, or the
 * one that names one.
 *
 * The family templates went Live on 2026-09-04. A phone carrying two or more
 * children on the list now gets `vpps_app_family_*` — "Students: Aaradhya (2),
 * Bhavya (5) · Total: Rs. 22,375" — instead of the spokesperson's per-child
 * notice quoting one sibling's balance as if it were the whole debt.
 *
 * Pure, and it imports `campaign-bodies-v3`, so nothing in `ui/` or `src/app`
 * may import THIS file either: only `data/run-sender.ts` and
 * `domain/fee-reminders.ts` (itself `server-only`) reach it.
 */

/**
 * The notices whose family template can be filled from what a run already
 * knows.
 *
 * `late_fee_applied` has a family template too, and it is deliberately NOT
 * here. Its body prints `Date passed: {{4}}` and `Total to pay: {{3}}` with
 * `Late fee included above: {{5}}`, and none of those three has a clean source
 * in a run today: the date would be the latest passed due date from the
 * calendar, which `executeReminderRun` is not handed; the total would be
 * Σ(fees + late fee) per child, whereas `ReminderFamily.totalAmount` sums
 * `dueAmount`, which on that notice is fees only; and the phrase would be the
 * ledger's summed late fee, not the run's lever. Three semantic changes to the
 * family shape for one notice. Until they are made, a family on that notice
 * gets the spokesperson's per-child message — one message per phone, as before
 * — and the sibling rows say why.
 */
export const FAMILY_TEMPLATE_SITUATIONS = [
  "fee_due",
  "balance",
  "upcoming",
] as const satisfies readonly NoticeSituation[];

function hasFamilyTemplate(situation: NoticeSituation): boolean {
  return (FAMILY_TEMPLATE_SITUATIONS as readonly string[]).includes(situation);
}

/**
 * The family template for this family and notice, or null when the per-child
 * notice must go instead.
 *
 * Null for a one-child phone: a family notice addressed to one child would
 * read "Students: Aaradhya (2)" and quote a "total" of one figure, which is the
 * per-child notice with worse wording. Null for a situation with no fillable
 * family template, and null — belt and braces — for a descriptor that exists
 * but is not approved.
 */
export function chooseFamilyCampaign(
  family: Pick<ReminderFamily, "members" | "language">,
  situation: NoticeSituation,
): FamilyCampaignDescriptor | null {
  if (family.members.length < 2) return null;
  if (!hasFamilyTemplate(situation)) return null;
  const campaign = describeFamilyCampaign(situation, family.language);
  if (!campaign || !campaign.approved) return null;
  return campaign;
}

export type FamilyNoticeSettings = {
  /** DD-MM-YYYY, as the screen shows it. */
  lastDate: string;
  lateFeeAmount: number;
  lateFeeBasis: LateFeeBasis;
};

/**
 * The five slots of a family notice, from the grouped family and the run's
 * settings.
 *
 * `{{5}}` is composed in the FAMILY's language, not the run's — the same rule
 * the per-child path applies — or an English family would read a Hindi
 * late-fee line inside an English message.
 */
export function familyNoticeValuesFor(
  family: Pick<ReminderFamily, "parentName" | "childrenLine" | "totalAmount" | "language">,
  settings: FamilyNoticeSettings,
): FamilyNoticeValues {
  return {
    parentName: family.parentName,
    childrenLine: family.childrenLine,
    totalAmount: family.totalAmount,
    lastDate: settings.lastDate,
    lateFeePhrase: lateFeePhrase(settings.lateFeeAmount, settings.lateFeeBasis, family.language),
  };
}

/**
 * Every campaign name a notice can log under today.
 *
 * Since the family templates went Live, one notice writes `whatsapp_reminder_sends`
 * rows under TWO names: the per-child campaign for a one-child phone, the
 * family campaign for the rest. "Already messaged today" has to read both, or
 * a family messaged under one name reads as un-contacted under the other and
 * the checkbox lets the office tick them again.
 */
export function campaignNamesForNotice(
  situation: NoticeSituation,
  language: NoticeLanguage,
): string[] {
  const names = [campaignNameFor(situation, language) ?? ""];
  const family = hasFamilyTemplate(situation)
    ? describeFamilyCampaign(situation, language)?.campaignName
    : null;
  if (family) names.push(family);
  return names.filter(Boolean);
}
