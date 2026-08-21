import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/ui/shell/page-header";
import { SectionCard } from "@/ui/shell/section-card";
import { CollapsibleSection } from "@/ui/primitives/collapsible-section";
import { OfficeNotice } from "@/ui/office/office-ui";
import { RemindersWorkspace } from "@/modules/whatsapp/ui/reminders-workspace";
import { TestSendPanel } from "@/modules/whatsapp/ui/test-send-panel";
import { createAdminClient } from "@/platform/supabase/admin";
import { hasStaffPermission, requireAnyStaffPermission } from "@/platform/supabase/session";
import { isAisensyConfigured } from "@/modules/whatsapp/data/aisensy";
import {
  drainPendingFinancialRefresh,
  istToday,
  loadReminderAudience,
  parseReminderFilters,
  resolveCurrentSessionLabel,
  type ReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";
import {
  campaignFor,
  installmentPhrase,
  NOTICE_SITUATIONS,
  TEMPLATE_INSTALLMENTS,
} from "@/modules/whatsapp/domain/campaigns";
import { getFeePolicySummary } from "@/modules/fees/data/policy";
import { formatDdMmYyyy, isoFromDdMmYyyy } from "@/platform/helpers/date";

// The list is only ever as good as the ledger it was read from, and staff will
// send money-bearing messages off it. Never serve it from a cache.
export const revalidate = 0;

// A run of a few hundred families is one request: rebuild the audience, call
// AiSensy in batches, then log. Well inside this, but the default ceiling is
// not something to discover halfway through a send — a request cut off after
// the provider calls leaves parents messaged and the office told nothing.
export const maxDuration = 300;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** One value out of the query string, or null when it is absent. */
function reader(params: Record<string, string | string[] | undefined>) {
  return (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) ?? null;
  };
}

export default async function WhatsappRemindersPage({ searchParams }: PageProps) {
  const t = await getTranslations("AdminTools");
  const staff = await requireAnyStaffPermission(["settings:view", "settings:write"], {
    onDenied: "redirect",
  });
  const canSend = hasStaffPermission(staff, "settings:write");

  const params = (await searchParams) ?? {};
  const supabase = createAdminClient();

  let sessionLabel: string;
  let audience: Awaited<ReturnType<typeof loadReminderAudience>>;
  let filters: ReminderFilters;
  let loadError: string | null = null;

  try {
    sessionLabel = await resolveCurrentSessionLabel(supabase);
    // Free unless a fee change is actually queued, and it keeps the figure on
    // screen equal to the one the send would re-derive.
    await drainPendingFinancialRefresh(supabase);
    // The same parser sendRemindersAction uses, so the audience this screen
    // shows and the one the send rebuilds cannot disagree.
    // The date slot is picked by the office, not derived — but it opens on
    // something sensible. NOT `next_due_date`: carry-forward rows are dated
    // 2026-04-01, before Installment 1, so that column reports the carry-forward
    // line for every family still carrying one.
    const policy = await getFeePolicySummary({ useAdmin: true }).catch(() => null);
    const upcoming = (policy?.installmentSchedule ?? [])
      .map((entry) => entry.dueDate)
      .filter((due): due is string => Boolean(due) && due >= istToday())
      .sort()[0];
    filters = parseReminderFilters(
      reader(params),
      sessionLabel,
      formatDdMmYyyy(upcoming ?? null),
    );
    audience = await loadReminderAudience(supabase, filters);
  } catch (caught) {
    loadError = caught instanceof Error ? caught.message : "Could not build the recipient list.";
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("eyebrow")}
          title="WhatsApp fee reminders"
          description="Pick families off the live dues list and send them the approved reminder."
        />
        <OfficeNotice title="Could not load the list" tone="danger">
          {loadError}
        </OfficeNotice>
      </div>
    );
  }

  const today = istToday();
  const campaign = campaignFor(filters.situation, filters.language);
  const campaignName = campaign.campaignName;
  const providerReady = isAisensyConfigured();
  // Only the fee_due template names its installments in fixed-ish wording; the
  // warning is meaningless for the other two.
  const wordingMismatch =
    filters.situation === "fee_due" &&
    (filters.installments.length !== TEMPLATE_INSTALLMENTS.length ||
      !TEMPLATE_INSTALLMENTS.every((installment: number) =>
        filters.installments.includes(installment),
      ));
  const pickedIso = isoFromDdMmYyyy(filters.lastDate);
  const dateHasPassed = filters.situation !== "prevyear" && (!pickedIso || pickedIso < today);
  const situationLabel =
    NOTICE_SITUATIONS.find((entry) => entry.value === filters.situation)?.label ?? "Notice";

  const familyCount = audience.candidates.length;
  const familyLabel = `${familyCount} famil${familyCount === 1 ? "y" : "ies"}`;

  return (
    // flex, not space-y: `order-*` needs a flex container, and space-y also puts
    // margins around `display:none` children, leaving a visible band where a
    // desktop-only notice used to be.
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title="WhatsApp fee reminders"
        description="Pick families off the live dues list and send them the approved reminder. Nothing sends on its own."
        // The section description below is `hidden md:block`, so without this the
        // phone never learns which session or how many families it is looking at.
        mobileEyebrow={`Session ${sessionLabel} · ${familyLabel}`}
      />

      {/* Phone order: the two blocking warnings, then the list, then the test
          panel, then the advisory warning, then the standing explanation. On
          `md:` and up no order class applies, so the desk keeps source order. */}
      {!providerReady ? (
        <OfficeNotice title="Sending is not configured" tone="warning" className="max-md:order-1">
          AISENSY_API_KEY is not set on the server. The list below is live, but Send will refuse.
        </OfficeNotice>
      ) : null}

      {dateHasPassed ? (
        <OfficeNotice title="That date has already passed" tone="danger" className="max-md:order-1">
          This notice would tell parents to pay by <strong>{filters.lastDate}</strong>, and today is{" "}
          {today}. Pick a date they can still meet — the field sits with the notice picker. Sending
          is blocked until then.
        </OfficeNotice>
      ) : null}

      <SectionCard
        title="Who is eligible"
        description={`Session ${sessionLabel}. ${familyLabel} match the filters below.`}
        className="max-md:order-4"
      >
        <RemindersWorkspace
          filters={filters}
          audience={audience}
          canSend={canSend && providerReady && !dateHasPassed}
          campaignName={campaignName}
        />
      </SectionCard>

      <CollapsibleSection
        title="Send yourself a test"
        description="One message to a number you control, using values you can edit. Never recorded against a family."
        // Above the list on a phone. Below it, the panel landed 42 screens down
        // past 170 cards — present, and effectively unreachable. Collapsed, it
        // costs one row here. The desk keeps source order: no `order` applies
        // at md and up, so it stays below the table where there is room.
        className="max-md:order-3"
      >
        <TestSendPanel
          // No date guard here: testing a template whose date has slipped, on a
          // staff phone, is exactly when you need to.
          canTest={canSend && providerReady}
          situation={filters.situation}
          language={filters.language}
          lastDate={filters.lastDate}
          sample={audience.candidates[0] ?? null}
          installmentPhrase={installmentPhrase(filters.installments)}
        />
      </CollapsibleSection>

      {wordingMismatch ? (
        <OfficeNotice
          title="The message will not match your filter"
          tone="warning"
          className="max-md:order-2"
        >
          The {situationLabel.toLowerCase()} notice names the installments it is about. You have
          filtered on installment {filters.installments.join(", ")}, so the message will say
          &ldquo;{installmentPhrase(filters.installments)}&rdquo; — check that is what you mean.
        </OfficeNotice>
      ) : null}

      {/* Four paragraphs of standing explanation is a desk read. The phone gets
          the one line that changes a decision, from the note above the list. */}
      <div className="hidden md:block">
        <OfficeNotice title="How this list works" tone="info">
          The list is rebuilt from the ledger every time this page loads, so a family who paid is
          simply gone from it — there is nothing to un-tick. Sending is manual: tick the families
          you mean, press Send, and each one gets the message once. A family already messaged today
          is marked and cannot be sent to again until tomorrow.
        </OfficeNotice>
      </div>
    </div>
  );
}
