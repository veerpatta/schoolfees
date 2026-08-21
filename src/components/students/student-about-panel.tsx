import { getTranslations } from "next-intl/server";

import { formatDateTimeIst, formatShortDate } from "@/platform/helpers/date";
import type { LedgerSelectedStudent } from "@/lib/ledger/types";
import {
  STUDENT_INFO_GROUPS,
  getStudentInfoFieldsByGroup,
  getStudentInfoOptionKey,
} from "@/lib/students/info-fields";
import type { StudentDetail } from "@/lib/students/types";
import { DetailList, DetailRow } from "@/ui/primitives/detail-list";
import { Section } from "@/ui/primitives/section";
import { StudentInfoGroupEditButton } from "@/components/students/student-info-sheet";

type StudentReceipt = {
  receiptNumber: string;
};

type StudentAboutPanelProps = {
  student: StudentDetail;
  ledger: LedgerSelectedStudent | null;
  receipts: StudentReceipt[];
  /** Gates the per-group quick-edit buttons. */
  canEditStudent?: boolean;
};

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return formatShortDate(value);
}

const formatDateTime = (value: string) => formatDateTimeIst(value);

export async function StudentAboutPanel({
  student,
  ledger,
  receipts,
  canEditStudent = false,
}: StudentAboutPanelProps) {
  const t = await getTranslations("Students");

  return (
    <div className="space-y-4">
      <Section title="Basic details" description="Identity, family, class, and route.">
        <div className="grid gap-5 lg:grid-cols-2">
          <DetailList>
            <DetailRow label="Student name" value={student.fullName} />
            <DetailRow label="SR no" value={student.admissionNo} />
            {/* Roll no is not repeated here — it lives in School record, with
                the TC number and the previous school. */}
            <DetailRow label="DOB" value={formatDate(student.dateOfBirth)} />
            <DetailRow label="Admission date" value={formatDate(student.joinedOn)} />
            <DetailRow label="Address" value={student.address} />
            <DetailRow label="Student status" value={student.studentStatusLabel} />
            <DetailRow label="Record status" value={student.status} />
          </DetailList>
          <DetailList>
            <DetailRow label="Father" value={student.fatherName} />
            <DetailRow label="Mother" value={student.motherName} />
            <DetailRow label="Father phone" value={student.fatherPhone} />
            <DetailRow label="Mother phone" value={student.motherPhone} />
            <DetailRow label="Email" value={student.email} />
            <DetailRow label="Route" value={student.transportRouteLabel} />
          </DetailList>
        </div>
      </Section>

      {/*
        The rest of the student record. Every row renders even when it is blank:
        on a desk screen the gaps are the point — they are the office's list of
        what still has to be collected from the family.
      */}
      {STUDENT_INFO_GROUPS.map((group) => {
        const fields = getStudentInfoFieldsByGroup(group.id);

        return (
          <Section
            key={group.id}
            id={`student-info-${group.id}`}
            title={t(group.labelKey)}
            actions={
              canEditStudent ? (
                <StudentInfoGroupEditButton
                  studentId={student.id}
                  group={group.id}
                  groupLabel={t(group.labelKey)}
                  values={Object.fromEntries(
                    fields.map((field) => [field.name, student[field.name] ?? ""]),
                  )}
                />
              ) : null
            }
          >
            <DetailList columns={2}>
              {fields.map((field) => {
                const value = student[field.name];
                // A value outside the option list has no translation key, and
                // asking for one renders the key itself — "Students.infoOptionSBC"
                // where a category should be. 22 students are in exactly that
                // position, so fall back to what is actually recorded.
                const optionKey =
                  value && field.options && field.translateOptions !== false
                    ? getStudentInfoOptionKey(value)
                    : null;
                const display =
                  optionKey && t.has(optionKey) ? t(optionKey) : value;

                return (
                  <DetailRow
                    key={field.name}
                    label={t(field.labelKey)}
                    value={display}
                  />
                );
              })}
            </DetailList>
          </Section>
        );
      })}

      <Section title="Notes" description="Office notes kept with the student record.">
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-4 text-sm text-foreground">
          {student.notes?.trim() || "—"}
        </div>
      </Section>

      <Section title="Record history" description="High-level record activity.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Created</p>
            <p className="mt-2 text-sm text-foreground">{formatDateTime(student.createdAt)}</p>
          </div>
          <div className="rounded-lg border border-border bg-surface-2 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Last updated</p>
            <p className="mt-2 text-sm text-foreground">{formatDateTime(student.updatedAt)}</p>
          </div>
        </div>
        {ledger ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Payment rows</p>
              <p className="mt-2 text-lg font-semibold text-foreground tabular-nums">{ledger.paymentOptions.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Adjustment rows</p>
              <p className="mt-2 text-lg font-semibold text-foreground tabular-nums">{ledger.adjustments.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-surface-2 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Latest receipt</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{receipts[0]?.receiptNumber ?? "-"}</p>
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
