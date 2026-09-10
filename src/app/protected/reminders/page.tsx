import Link from "next/link";

import { PageHeader } from "@/ui/shell/page-header";
import { Button } from "@/ui/primitives/button";
import { SectionCard } from "@/ui/shell/section-card";
import { CollapsibleSection } from "@/ui/primitives/collapsible-section";
import { OfficeNotice } from "@/ui/office/office-ui";
import { RemindersWorkspace } from "@/modules/whatsapp/ui/reminders-workspace";
import { DueTodayCard } from "@/modules/whatsapp/ui/due-today-card";
import { HoldoutControl } from "@/modules/whatsapp/ui/holdout-control";
import { CollectionListLinks } from "@/modules/whatsapp/ui/collection-list-links";
import { campaignsDueOn } from "@/modules/whatsapp/domain/campaign-schedule";
import {
  buildInstallmentCalendar,
  describeDateGuard,
  type InstallmentCalendar,
} from "@/modules/whatsapp/domain/installment-calendar";
import { TestSendPanel } from "@/modules/whatsapp/ui/test-send-panel";
import { createAdminClient } from "@/platform/supabase/admin";
import { hasStaffPermission, requireAnyStaffPermission } from "@/platform/supabase/session";
import { isAisensyConfigured } from "@/modules/whatsapp/data/aisensy";
import {
  istToday,
  loadReminderAudience,
  resolveCurrentSessionLabel,
  type ReminderFilters,
} from "@/modules/whatsapp/domain/fee-reminders";
import {
  campaignNameFor,
  installmentPhrase,
  isLedgerQuotedSituation,
  NOTICE_SITUATIONS,
  noticeValuesFrom,
  TEMPLATE_INSTALLMENTS,
} from "@/modules/whatsapp/domain/campaigns";
import { QUOTE_BASES, reminderQuery } from "@/modules/whatsapp/domain/audience";
import { AudienceBuilder } from "@/modules/whatsapp/ui/audience-builder";
import { CarriedFilterFields } from "@/modules/whatsapp/ui/carried-filter-fields";
import { NoticePicker } from "@/modules/whatsapp/ui/notice-picker";
import { loadStudentBriefs, searchSessionStudents } from "@/modules/whatsapp/data/student-lookup";
import {
  addReminderStudentAction,
  applyNoticeSettingsAction,
} from "@/app/protected/reminders/actions";
import { renderNoticePreview } from "@/modules/whatsapp/domain/campaign-bodies";
import { openingNoticeValues } from "@/modules/whatsapp/domain/test-send-values";
import {
  listCampaigns,
  loadRanScheduleSlots,
  type SavedCampaign,
} from "@/modules/whatsapp/data/campaign-store";
import { describeLateFeeDrift } from "@/modules/whatsapp/domain/late-fee";
import { readerFor, resolveReminderContext } from "@/modules/whatsapp/data/reminder-context";
import { isoFromDdMmYyyy } from "@/platform/helpers/date";

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

/**
 * One value out of the query string, or null when it is absent.
 *
 * `readerFor` from `data/reminder-context`, not a local copy: a repeated key
 * has to join with a comma rather than take the first value, because the
 * installment control is four checkboxes sharing one name. A second copy of
 * that rule here is how this screen and the collection lists would name
 * different families again.
 */
const reader = readerFor;

export default async function WhatsappRemindersPage({ searchParams }: PageProps) {
  const staff = await requireAnyStaffPermission(["settings:view", "settings:write"], {
    onDenied: "redirect",
  });
  const canSend = hasStaffPermission(staff, "settings:write");

  const params = (await searchParams) ?? {};
  const supabase = createAdminClient();

  let sessionLabel: string;
  let ledgerLateFee = 0;
  let calendar: InstallmentCalendar = buildInstallmentCalendar({
    schedule: [],
    today: istToday(),
  });
  let savedCampaigns: SavedCampaign[] = [];
  let ranSlots = new Map<string, string[]>();
  let audience: Awaited<ReturnType<typeof loadReminderAudience>>;
  let filters: ReminderFilters;
  let loadError: string | null = null;

  try {
    sessionLabel = await resolveCurrentSessionLabel(supabase);
    // The drain, the policy read, the window-before-calendar parse and the
    // filter parse all live in `resolveReminderContext` now, because the
    // collection-lists screen and its export have to derive the SAME audience
    // from the SAME query string. Two copies of this is how a teacher's sheet
    // ends up naming families this screen never showed.
    const context = await resolveReminderContext(supabase, sessionLabel, reader(params));
    ledgerLateFee = context.ledgerLateFee;
    calendar = context.calendar;
    filters = context.filters;
    audience = context.audience;
    // Cheap, and it lets the header say how many are saved without a second page.
    savedCampaigns = await listCampaigns(supabase, sessionLabel).catch(() => []);
    // Which scheduled slots have already gone out, so a campaign that ran this
    // morning is not offered again this afternoon. Best-effort: a due-card that
    // cannot be built must not take the send screen down with it.
    ranSlots = await loadRanScheduleSlots(supabase, sessionLabel).catch(
      () => new Map<string, string[]>(),
    );
  } catch (caught) {
    loadError = caught instanceof Error ? caught.message : "Could not build the recipient list.";
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Reminders"
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
  // Not a filter — it changes nobody's eligibility — so it rides alongside
  // rather than going through parseReminderFilters. It exists only so the run
  // record can say which saved campaign produced it.
  const campaignId = reader(params)("campaignId");
  const activeCampaign = campaignId
    ? savedCampaigns.find((entry) => entry.id === campaignId) ?? null
    : null;
  // `campaignNameFor`, not `campaignFor`: this page must RENDER a notice
  // awaiting Meta approval — disabled chip, audience count, held-back list — and
  // `campaignFor` throws for one. A hand-edited `?situation=upcoming` would
  // otherwise blank the whole screen, which is the failure
  // `parseReminderFilters` falls back rather than throws to avoid.
  const campaignName = campaignNameFor(filters.situation, filters.language) ?? "";
  const providerReady = isAisensyConfigured();
  // Only the fee_due template names its installments in fixed-ish wording; the
  // warning is meaningless for the other two.
  //
  // `length > 0` first, and that guard is the whole point: `fee_due`'s preset
  // now carries NO installment set, so without it this fired on every default
  // page load and rendered "You have filtered on installment " with nothing
  // after it. An empty set is not a mismatch — `contextInstallments` follows
  // the family's own overdue rows in that case, which is exactly what the
  // amount is summed over. The warning means what it says again: you ticked
  // installments, and the wording will name them.
  const wordingMismatch =
    filters.situation === "fee_due" &&
    filters.installments.length > 0 &&
    (filters.installments.length !== TEMPLATE_INSTALLMENTS.length ||
      !TEMPLATE_INSTALLMENTS.every((installment: number) =>
        filters.installments.includes(installment),
      ));
  const pickedIso = isoFromDdMmYyyy(filters.lastDate);
  // No prevyear exception any more: v2 gave that notice a settle-by date too.
  // `describeDateGuard`, not a bare comparison: the rule is per notice.
  // `late_fee_applied` prints no date at all — its subject IS that a date has
  // gone — so a raw `pickedIso < today` would grey out the send button on the
  // one notice that fits the situation.
  const dateHasPassed = Boolean(
    describeDateGuard({
      situation: filters.situation,
      lastDateIso: pickedIso,
      lastDateLabel: filters.lastDate,
      today,
    }),
  );
  // Warn, never block: the office may deliberately quote a late fee the ledger
  // will not charge — that is what the control is for — but not by accident.
  const lateFeeWarning = describeLateFeeDrift({
    amount: filters.lateFeeAmount,
    basis: filters.lateFeeBasis,
    ledgerAmount: ledgerLateFee,
    isCarryForward: filters.situation === "prevyear",
    // Until 2026-09-10 these three could only quote the ledger, so there was
    // nothing to drift from. They can be put in custom mode now, and that is
    // the one place a typed figure stops being a lever and becomes a claim
    // about the account — `describeLateFeeDrift` says so in its own words.
    isLedgerQuoted: isLedgerQuotedSituation(filters.situation),
    source: filters.lateFeeSource,
    statesAccountBalance: isLedgerQuotedSituation(filters.situation),
  });
  /**
   * The message the top family on the list would receive, rendered here rather
   * than in the browser — the bodies live in `domain/campaign-bodies`, which
   * the client bundle never reaches.
   *
   * Rendered for an unapproved notice too: the office needs to read what is
   * awaiting Meta. Same descriptor and same builder as the send path, so the
   * preview and the message cannot quote different values. Null only when the
   * list is empty or nothing is registered for a hand-edited `?situation=`.
   */
  const previewSample = audience.candidates[0] ?? null;
  const previewBody = previewSample
    ? renderNoticePreview(
        filters.situation,
        filters.language,
        noticeValuesFrom(previewSample, filters),
      )
    : null;
  // The test panel's opening preview, from the SAME values its fields open on.
  const testPreview = renderNoticePreview(
    filters.situation,
    filters.language,
    openingNoticeValues(filters, previewSample),
  );

  /**
   * The scheduled slots that have arrived and not gone out.
   *
   * Computed here rather than in the card because it is a pure read over data
   * this page already holds, and the card is a server component with no state —
   * keeping the arithmetic out of the client bundle on a route with a ceiling.
   */
  const dueCampaigns = campaignsDueOn(
    savedCampaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      situation: campaign.situation,
      language: campaign.language,
      schedule: campaign.schedule,
      ranForSlots: ranSlots.get(campaign.id) ?? [],
    })),
    calendar,
    today,
  );

  const situationLabel =
    NOTICE_SITUATIONS.find((entry) => entry.value === filters.situation)?.label ?? "Notice";

  /**
   * The students the office named by hand, and any search that did not resolve
   * to exactly one person.
   *
   * Resolved here rather than in the builder so the whole audience panel stays
   * a pure render: one page, one set of reads. Best-effort throughout — a
   * lookup that fails must not take a send screen down, it just shows fewer
   * chips.
   */
  const findQuery = reader(params)("find")?.trim() ?? "";
  const [handPicked, matches] = await Promise.all([
    loadStudentBriefs(supabase, sessionLabel, [
      ...filters.includeStudentIds,
      ...filters.excludeStudentIds,
    ]).catch(() => []),
    findQuery
      ? searchSessionStudents(supabase, sessionLabel, findQuery).catch(() => [])
      : Promise.resolve([]),
  ]);
  const briefById = new Map(handPicked.map((brief) => [brief.studentId, brief]));
  const includedBriefs = filters.includeStudentIds
    .map((id) => briefById.get(id))
    .filter((brief): brief is NonNullable<typeof brief> => Boolean(brief));
  const excludedBriefs = filters.excludeStudentIds
    .map((id) => briefById.get(id))
    .filter((brief): brief is NonNullable<typeof brief> => Boolean(brief));

  /**
   * One sentence saying who is on the list, composed from the FILTERS.
   *
   * It used to be `SITUATION_RULE[situation]` — one line per notice, describing
   * the audience that notice defined for itself. The notice does not define one
   * any more, so a fixed sentence per notice would now be a description of
   * something that is not happening.
   */
  const quoteLabel =
    QUOTE_BASES.find((entry) => entry.value === filters.quote)?.label ?? "the pending amount";
  /**
   * There is no `audienceRule` here any more.
   *
   * It was a second description of the same list — a comma-joined rule string
   * rendered under "Who is on this list" beside the families, while the
   * audience panel rendered its own `Inst 1+2 all · paid ≤ 1100` summary. Two
   * hand-rolled sentences over one filter set, each able to drift from the
   * other and from the engine. `describeAudience` in `domain/audience.ts` is
   * now the only one, and the panel that owns the filters is the only place it
   * appears.
   */

  /** What the amount on each row is, given the basis the office chose. */
  const amountNote = `The amount on each card is ${quoteLabel.toLowerCase()} — the figure the message will quote.`;

  /**
   * `?…&exclude=` with a trailing separator, so a row's Remove link is this
   * plus the student id.
   *
   * Built by appending the key rather than through `reminderQuery`, because
   * that collapses an empty value to an absent key — and
   * `[...[], ""].join(",")` IS empty. So with nothing excluded yet, which is
   * the normal case, the prefix ended at `quote=ledger_fees` and the row link
   * became `quote=ledger_feesf9c15390-…`: the Remove button silently corrupted
   * the quote basis and excluded nobody. Caught by reading the rendered
   * accessibility tree on production; every earlier check had hand-built
   * `?exclude=<id>`, which exercised the PARSE and never the link.
   */
  const excludeHrefPrefix = `?${reminderQuery(filters, { exclude: null }).toString()}&exclude=${
    filters.excludeStudentIds.length > 0 ? `${filters.excludeStudentIds.join(",")},` : ""
  }`;

  const savedCampaignCount = savedCampaigns.length;
  const familyCount = audience.candidates.length;
  const familyLabel = `${familyCount} famil${familyCount === 1 ? "y" : "ies"}`;

  return (
    // flex, not space-y: `order-*` needs a flex container, and space-y also puts
    // margins around `display:none` children, leaving a visible band where a
    // desktop-only notice used to be.
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Reminders"
        title="WhatsApp fee reminders"
        description="Pick families off the live dues list and send them the approved reminder. Nothing sends on its own."
        // The section description below is `hidden md:block`, so without this the
        // phone never learns which session or how many families it is looking at.
        mobileEyebrow={`Session ${sessionLabel} · ${familyLabel}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/protected/reminders/campaigns">
              Campaigns{savedCampaignCount > 0 ? ` (${savedCampaignCount})` : ""}
            </Link>
          </Button>
        }
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
        title="Build the message"
        description={`Session ${sessionLabel}. ${familyLabel} on the list right now.`}
        className="max-md:order-4"
      >
        {/* Above the list on every viewport: a slot that has arrived is the
          first thing the office needs to know, and on a phone anything below
          the card list is 40 screens down. */}
      <DueTodayCard
        due={dueCampaigns}
        hrefFor={(campaign) =>
          `/protected/reminders?campaignId=${campaign.id}&situation=${campaign.situation}&language=${campaign.language}`
        }
      />

      <RemindersWorkspace
          audience={audience}
          canSend={canSend && providerReady && !dateHasPassed}
          campaignName={campaignName}
          previewBody={previewBody}
          holdoutControl={<HoldoutControl />}
          listActions={<CollectionListLinks filters={filters} />}
          amountNote={amountNote}
          excludeHrefPrefix={excludeHrefPrefix}
          savedCampaign={activeCampaign ? { id: activeCampaign.id, name: activeCampaign.name } : null}
          noticeControls={
            <NoticePicker
              filters={filters}
              noticeGaps={audience.noticeGaps}
              candidateCount={audience.candidates.length}
              dateFieldId="lastDate"
              lateFeeWarning={lateFeeWarning}
              applyAction={applyNoticeSettingsAction}
            />
          }
          audienceControls={
            <AudienceBuilder
              filters={filters}
              audience={audience}
              included={includedBriefs}
              excluded={excludedBriefs}
              matches={matches}
              searchQuery={findQuery}
              // The SAME values the audience was counted with, so a shortcut
              // chip reading 92 lands on that exact 92.
              calendarArgs={{
                activeInstallments:
                  calendar.active.length > 0 ? calendar.active : TEMPLATE_INSTALLMENTS,
                nextInstallment: calendar.next?.installmentNo ?? null,
              }}
              addAction={addReminderStudentAction}
            />
          }
          sendFormFields={<CarriedFilterFields filters={filters} />}
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
          // Remount when the screen's notice changes, so the panel's own picker
          // follows it rather than keeping yesterday's choice in client state.
          key={`${filters.situation}-${filters.language}`}
          // No date guard here: testing a template whose date has slipped, on a
          // staff phone, is exactly when you need to.
          canTest={canSend && providerReady}
          situation={filters.situation}
          language={filters.language}
          lastDate={filters.lastDate}
          sample={audience.candidates[0] ?? null}
          // The raw settings, not composed phrases: the panel runs the SAME
          // `noticeValuesFrom` projection the send does, so its opening values
          // are exactly what the top family would be sent.
          installments={filters.installments}
          lateFeeAmount={filters.lateFeeAmount}
          lateFeeBasis={filters.lateFeeBasis}
          // Without these the panel composed slot 7 from the TYPED amount
          // whatever mode the run was in — so a test of an Actual-mode fee-due
          // notice posted ₹4,000 while the run itself would send the ledger's
          // ₹1,000. It read correctly on the waiver notices only because those
          // default to ledger, which is what hid it.
          lateFeeSource={filters.lateFeeSource}
          policyLateFeeAmount={filters.policyLateFeeAmount}
          initialPreview={testPreview}
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
          &ldquo;{installmentPhrase(filters.installments, "en")}&rdquo; — check that is what you mean.
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
