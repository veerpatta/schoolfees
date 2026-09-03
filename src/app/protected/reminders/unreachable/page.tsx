import Link from "next/link";

import { PageHeader } from "@/ui/shell/page-header";
import { OfficeNotice } from "@/ui/office/office-ui";
import { createAdminClient } from "@/platform/supabase/admin";
import { requireAnyStaffPermission } from "@/platform/supabase/session";
import { getFeePolicySummary } from "@/modules/fees/data/policy";
import {
  drainPendingFinancialRefresh,
  istToday,
  loadReminderAudience,
  parseReminderFilters,
  resolveCurrentSessionLabel,
} from "@/modules/whatsapp/domain/fee-reminders";
import { buildInstallmentCalendar } from "@/modules/whatsapp/domain/installment-calendar";
import { formatDdMmYyyy } from "@/platform/helpers/date";
import { formatInr } from "@/platform/helpers/currency";

/**
 * The families WhatsApp can never reach.
 *
 * No number on record, or a number that is not a usable mobile. They owe money
 * like everybody else and the reminder system is structurally blind to them, so
 * the only honest thing to do is hand the office a piece of paper and a way to
 * fix the record.
 *
 * Two ways off this page, and both are on every row: **print a slip** to send
 * home with the child, and **edit the student** to put a working number in. The
 * second is the one that actually solves it.
 *
 * A SUB-PAGE, so it is a mobile takeover — `/protected/reminders/` is in
 * `mobileTakeoverRoutes` and `MobileBottomNav` renders nothing here. Bottom
 * spacing is the safe area only.
 *
 * The slip is printed with `window.print()` through the same `@media print`
 * approach the receipts use, rather than a server-side PDF library: the office
 * already prints receipts this way, the browser's own dialog offers "Save as
 * PDF", and adding a PDF dependency for a list of names is not a trade worth
 * making.
 */

export const revalidate = 0;

export default async function UnreachableFamiliesPage() {
  await requireAnyStaffPermission(["settings:view", "settings:write"], { onDenied: "redirect" });

  const supabase = createAdminClient();
  const sessionLabel = await resolveCurrentSessionLabel(supabase);
  await drainPendingFinancialRefresh(supabase);

  const policy = await getFeePolicySummary({ useAdmin: true }).catch(() => null);
  const calendar = buildInstallmentCalendar({
    schedule: policy?.installmentSchedule ?? [],
    today: istToday(),
  });

  // The same audience the send screen builds, so "unreachable" means exactly
  // what it means there. Read with no filters: a family with no phone is
  // unreachable whichever notice is selected.
  const filters = parseReminderFilters(
    () => null,
    sessionLabel,
    formatDdMmYyyy(calendar.next?.dueDate ?? null),
    Number(policy?.lateFeeFlatAmount ?? 0),
    calendar.active,
  );
  const audience = await loadReminderAudience(supabase, filters, calendar);

  // Grouped by class, because a slip goes home with a child and a class teacher
  // hands out a class's worth at once.
  const byClass = new Map<string, typeof audience.unreachable>();
  for (const family of audience.unreachable) {
    const key = family.studentClass || "No class";
    const list = byClass.get(key);
    if (list) list.push(family);
    else byClass.set(key, [family]);
  }
  const classes = [...byClass.entries()].sort(([left], [right]) => left.localeCompare(right));

  return (
    <div
      className="flex flex-col gap-6"
      style={{ paddingBottom: "calc(var(--mobile-safe-area-bottom, 0px) + 0.75rem)" }}
    >
      {/* print:hidden so the slips carry no app chrome. */}
      <div className="print:hidden">
        <PageHeader
          eyebrow="Reminders"
          title="Families WhatsApp cannot reach"
          description={`${audience.unreachable.length} students with no usable number on record. Session ${sessionLabel}.`}
          actions={
            <Link
              href="/protected/reminders"
              className="focus-ring inline-flex h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold"
            >
              Back to reminders
            </Link>
          }
        />
      </div>

      {audience.unreachable.length === 0 ? (
        <OfficeNotice title="Every family has a number" tone="success">
          Nobody on the dues list is unreachable by WhatsApp right now.
        </OfficeNotice>
      ) : (
        <>
          <div className="print:hidden">
            <OfficeNotice title="Two ways off this list" tone="info">
              Print the slips below to send home with the children, and fix the numbers on the
              student records. Only the second one gets a family off this page for good.
            </OfficeNotice>
          </div>

          {/* flex gap, never space-y: the print-only heading is hidden on screen
              and space-y would leave a band where it sits. */}
          <div className="flex flex-col gap-6">
            <h1 className="hidden text-lg font-bold print:block">
              Fee notice — families to contact by hand
            </h1>

            {classes.map(([className, families]) => (
              <section
                key={className}
                // Each class starts a fresh sheet, so a teacher gets one page per class.
                className="break-inside-avoid rounded-xl border border-border bg-card p-4 print:break-after-page print:border-0 print:p-0"
              >
                <h2 className="text-sm font-bold text-foreground">
                  {className}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {families.length} {families.length === 1 ? "student" : "students"}
                  </span>
                </h2>

                <ul className="mt-3 flex flex-col gap-2">
                  {families.map((family) => (
                    <li
                      key={family.studentId}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border/60 pb-2 last:border-0"
                    >
                      <span className="text-sm text-foreground">
                        <span className="font-semibold tabular-nums">{family.admissionNo}</span>
                        <span className="mx-2 text-muted-foreground">·</span>
                        {family.studentName}
                      </span>
                      {/* min-h-11 tap target, and hidden on the printed slip —
                          a link is no use on paper. */}
                      <Link
                        href={`/protected/students/${family.studentId}/edit`}
                        className="focus-ring inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-accent underline-offset-2 hover:underline print:hidden"
                      >
                        Add a number
                      </Link>
                      <span className="hidden text-xs text-muted-foreground print:block">
                        Phone: ______________________
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <p className="hidden text-xs print:block">
            Please write a WhatsApp number against your child&apos;s name and return this slip to
            the school office. Fees can be paid at the counter or by UPI.
            {policy?.lateFeeFlatAmount
              ? ` A late fee of ${formatInr(policy.lateFeeFlatAmount)} applies per installment after its due date.`
              : ""}
          </p>
        </>
      )}
    </div>
  );
}
