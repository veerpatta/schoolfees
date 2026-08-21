import type { Metadata } from "next";

import { PageHeader } from "@/ui/shell/page-header";
import { MobileCard, MobileNote, MobileScreen } from "@/ui/mobile/mobile-kit";
import {
  MONEY_GLOSSARY,
  MONEY_GLOSSARY_ORDER,
  type MoneyTermKey,
} from "@/platform/money/glossary";
import { getTranslations } from "next-intl/server";

import { requireStaffPermission } from "@/platform/supabase/session";

export const metadata: Metadata = {
  title: "Money words explained",
};

/**
 * "Money words explained" — the phone app's own screen for the glossary that
 * already backs every `<MoneyWithDefinition>` tooltip.
 *
 * On desktop a staff member taps the ⓘ next to a number and gets one term in
 * a modal. On a phone that gesture is fiddly and the office often wants to
 * read the whole vocabulary once — so the same `MONEY_GLOSSARY` source gets a
 * full screen under More → System. One dictionary, two ways in.
 */
/**
 * Dot colour per term, following the design: money you can ask for now is
 * warm, money already past its date is red, money not yet askable is grey,
 * money in your favour is green, and corrections are blue. A single accent
 * dot for 36 terms carried no information.
 */
const TERM_TONE: Partial<Record<MoneyTermKey, string>> = {
  pending: "bg-warning",
  feesPending: "bg-warning",
  dueNow: "bg-warning",
  outstanding: "bg-warning",
  balanceDue: "bg-warning",
  daysOverdue: "bg-destructive",
  reversed: "bg-destructive",
  notDueYet: "bg-border-strong",
  oldBalance: "bg-foreground",
  advance: "bg-success",
  creditBalance: "bg-success",
  totalPaid: "bg-success",
  adjustmentPositive: "bg-info",
  adjustmentNegative: "bg-info",
  adjustmentNet: "bg-info",
  closedAsDiscount: "bg-info",
};
export default async function MoneyGlossaryPage() {
  await requireStaffPermission("dashboard:view", { onDenied: "redirect" });
  const t = await getTranslations("MobileApp");

  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <PageHeader
          eyebrow="Reference"
          title="Money words explained"
          description="Plain meaning of every money label in this app. The same definitions back the ⓘ tooltips next to individual numbers."
        />
      </div>

      <MobileScreen className="md:gap-4">
        <div className="md:hidden">
          <h1 className="text-xl font-extrabold leading-tight tracking-tight text-foreground">
            {t("glossaryTitle")}
          </h1>
          <p className="mt-0.5 text-[11.5px] font-medium text-muted-foreground">
            {t("glossarySub")}
          </p>
        </div>

        <ul className="flex flex-col gap-2.5">
          {MONEY_GLOSSARY_ORDER.map((key) => {
            const term = MONEY_GLOSSARY[key];
            return (
              <MobileCard as="li" key={key}>
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 inline-block size-2 shrink-0 rounded-full ${TERM_TONE[key] ?? "bg-accent"}`}
                  />
                  <div className="min-w-0">
                    <h2 className="text-[13.5px] font-extrabold text-foreground">
                      {term.label}
                    </h2>
                    <p className="mt-0.5 text-[12px] font-semibold leading-relaxed text-foreground/80">
                      {term.summary}
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                      {term.detail}
                    </p>
                  </div>
                </div>
              </MobileCard>
            );
          })}
        </ul>

        <MobileNote icon="📖">
          {t("glossaryNote")}
        </MobileNote>
      </MobileScreen>
    </div>
  );
}
