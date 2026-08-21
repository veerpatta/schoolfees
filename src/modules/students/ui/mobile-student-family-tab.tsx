import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { MobileCard, MobileStatStrip } from "@/ui/mobile/mobile-kit";
import { LinkSiblingTrigger } from "@/modules/students/ui/link-sibling-trigger";
import { StudentAvatar } from "@/modules/students/ui/student-avatar";
import { StudentRowCollectButton } from "@/modules/students/ui/student-row-collect-button";
import { UnlinkSiblingTrigger } from "@/modules/students/ui/unlink-sibling-trigger";
import { formatInr } from "@/platform/helpers/currency";
import { appendSessionParam } from "@/platform/navigation/session-href";
import { resolveSiblingPickerExclusions } from "@/modules/students/domain/family-link";
import type { StudentFamilyMemberDetail } from "@/modules/students/data/queries";

/**
 * Family tab of the phone student profile (mobile app v2, §STUDENT DETAIL).
 *
 * "Combined family fees" is a combined *view*: the family's expected / paid /
 * outstanding totals, one row per sibling with that child's own number, and the
 * family statement and batch receipt reprint. Collection stays one student at a
 * time through the Payment Desk — a receipt covering two students would break
 * the append-only ledger's one-receipt-one-student shape, and
 * `tests/unit/individual-payments-only-audit.test.ts` enforces it.
 *
 * Linking never grants a discount by itself. The 3rd Child Policy is applied by
 * the server actions these triggers already call, after an explicit staff tap.
 * A family only exists once staff link it — there is no phone-match detection.
 */
export async function MobileStudentFamilyTab({
  studentId,
  familyGroupId,
  members,
  sessionLabel,
  canEditStudent,
  canCollectPayments,
  returnTo,
  currentStudent,
}: {
  studentId: string;
  familyGroupId: string | null;
  members: StudentFamilyMemberDetail[];
  sessionLabel: string;
  canEditStudent: boolean;
  canCollectPayments: boolean;
  returnTo: string;
  currentStudent: {
    fullName: string;
    admissionNo: string;
    classLabel: string;
    fatherName: string | null;
    primaryPhone: string | null;
  };
}) {
  const t = await getTranslations("MobileApp");
  const siblings = members.filter((member) => !member.isSelf);
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  const alreadyLinkedIds = resolveSiblingPickerExclusions({ familyGroupId, members });
  const linkTrigger = canEditStudent ? (
    <LinkSiblingTrigger
      studentId={studentId}
      studentLabel={currentStudent.fullName}
      studentAdmissionNo={currentStudent.admissionNo}
      studentClassLabel={currentStudent.classLabel}
      studentFatherName={currentStudent.fatherName}
      studentPhone={currentStudent.primaryPhone}
      sessionLabel={sessionLabel}
      excludeStudentIds={alreadyLinkedIds}
      size="default"
      className="h-12 w-full justify-center rounded-xl text-[13px] font-extrabold"
    />
  ) : null;

  if (siblings.length === 0) {
    return (
      <div className="flex flex-col gap-2.5">
        <MobileCard className="text-center">
          <p className="text-[13px] font-extrabold text-foreground">{t("familyNoSiblings")}</p>
          <p className="mx-auto mt-1 max-w-[17rem] text-[11.5px] leading-relaxed text-muted-foreground">
            {t("familyNoSiblingsBody")}
          </p>
          {linkTrigger ? <div className="mt-3.5">{linkTrigger}</div> : null}
        </MobileCard>
      </div>
    );
  }

  const totalDue = members.reduce((sum, m) => sum + (m.financials?.totalDue ?? 0), 0);
  const totalPaid = members.reduce((sum, m) => sum + (m.financials?.totalPaid ?? 0), 0);
  const totalOutstanding = members.reduce((sum, m) => sum + (m.financials?.outstanding ?? 0), 0);

  return (
    <div className="flex flex-col gap-2.5">
      <MobileCard>
        <div className="flex items-baseline justify-between gap-2.5">
          <h2 className="text-[13.5px] font-extrabold text-foreground">{t("familyTitle")}</h2>
          <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-[0.06em] text-success-soft-foreground">
            {t("familyConfirmed")}
          </span>
        </div>

        <ul className="mt-3 flex flex-col gap-2">
          {members.map((member) => {
            const outstanding = member.financials?.outstanding ?? 0;
            const memberHref = withSession(
              `/protected/students/${member.id}?returnTo=${encodeURIComponent(returnTo)}`,
            );
            return (
              <li
                key={member.id}
                className={`rounded-xl border border-border p-2.5 ${
                  member.isSelf ? "bg-accent-soft/30" : "bg-card"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <StudentAvatar photoPath={null} fullName={member.fullName} size="sm" />
                  <div className="min-w-0 flex-1">
                    {member.isSelf ? (
                      <p className="truncate text-[12.5px] font-extrabold text-foreground">
                        {member.fullName}{" "}
                        <span className="text-[10px] font-bold text-muted-foreground">
                          · {t("familySelf")}
                        </span>
                      </p>
                    ) : (
                      <Link
                        href={memberHref}
                        className="focus-ring block truncate rounded-sm text-[12.5px] font-extrabold text-foreground"
                      >
                        {member.fullName}
                      </Link>
                    )}
                    <p className="truncate text-[10.5px] font-medium text-muted-foreground">
                      {member.classLabel} · SR {member.admissionNo}
                    </p>
                  </div>
                  <span
                    className={`tabular shrink-0 text-[12.5px] font-extrabold ${
                      outstanding > 0 ? "text-warning" : "text-success"
                    }`}
                  >
                    {outstanding > 0 ? formatInr(outstanding) : t("familyFullyPaid")}
                  </span>
                </div>

                {(!member.isSelf && canCollectPayments && outstanding > 0) ||
                (!member.isSelf && canEditStudent && familyGroupId) ? (
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-2">
                    {canEditStudent && familyGroupId ? (
                      <UnlinkSiblingTrigger
                        studentId={member.id}
                        familyGroupId={familyGroupId}
                        sessionLabel={sessionLabel}
                        memberLabel={member.fullName}
                      />
                    ) : null}
                    {canCollectPayments && outstanding > 0 ? (
                      // One student, one receipt — the same Payment Desk
                      // navigation every other Collect affordance uses.
                      <StudentRowCollectButton
                        studentId={member.id}
                        studentLabel={member.fullName}
                        classLabel={member.classLabel}
                        returnTo={returnTo}
                        label={t("familyCollectFor", {
                          name: member.fullName.split(" ")[0] ?? member.fullName,
                        })}
                        variant="primary"
                        className="h-8 rounded-[10px] border border-accent/35 bg-accent-soft px-3 text-[11.5px] font-extrabold text-accent-soft-foreground hover:bg-accent-soft"
                      />
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </MobileCard>

      <MobileStatStrip
        stats={[
          { label: t("familyTotalsExpected"), value: formatInr(totalDue) },
          { label: t("familyTotalsPaid"), value: formatInr(totalPaid), tone: "success" },
          {
            label: t("familyTotalsOutstanding"),
            value: formatInr(totalOutstanding),
            tone: totalOutstanding > 0 ? "warning" : "success",
          },
        ]}
      />

      {familyGroupId ? (
        <div className="flex flex-col gap-2">
          <Link
            href={withSession(`/protected/students/family/${familyGroupId}/statement`)}
            target="_blank"
            className="focus-ring grid h-12 place-items-center rounded-xl border border-border bg-surface-2 text-[12.5px] font-extrabold text-foreground"
          >
            {t("familyStatementCta")}
          </Link>
          {linkTrigger}
        </div>
      ) : null}
    </div>
  );
}
