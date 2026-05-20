import { Section } from "@/components/ui/section";
import { formatShortDate } from "@/lib/helpers/date";
import type { LedgerSelectedStudent } from "@/lib/ledger/types";
import type { StudentDetail } from "@/lib/students/types";

type StudentReceipt = {
  receiptNumber: string;
};

type StudentAboutPanelProps = {
  student: StudentDetail;
  ledger: LedgerSelectedStudent | null;
  receipts: StudentReceipt[];
};

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return formatShortDate(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function readValue(value: string | null) {
  return value?.trim() || "-";
}

export function StudentAboutPanel({ student, ledger, receipts }: StudentAboutPanelProps) {
  return (
    <div className="space-y-4">
      <Section title="Basic details" description="Identity, family, class, and route.">
        <div className="grid gap-5 lg:grid-cols-2">
          <dl className="space-y-3 text-sm text-foreground">
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">Student name</dt>
              <dd>{student.fullName}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">SR no</dt>
              <dd>{student.admissionNo}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">DOB</dt>
              <dd>{formatDate(student.dateOfBirth)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">Address</dt>
              <dd>{readValue(student.address)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">Student status</dt>
              <dd>{student.studentStatusLabel}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">Record status</dt>
              <dd>{student.status}</dd>
            </div>
          </dl>
          <dl className="space-y-3 text-sm text-foreground">
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">Father</dt>
              <dd>{readValue(student.fatherName)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">Mother</dt>
              <dd>{readValue(student.motherName)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">Father phone</dt>
              <dd>{readValue(student.fatherPhone)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">Mother phone</dt>
              <dd>{readValue(student.motherPhone)}</dd>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <dt className="font-medium text-muted-foreground">Route</dt>
              <dd>{student.transportRouteLabel}</dd>
            </div>
          </dl>
        </div>
      </Section>

      <Section title="Notes" description="Office notes kept with the student record.">
        <div className="rounded-lg border border-border bg-surface-2 px-4 py-4 text-sm text-foreground">
          {readValue(student.notes)}
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
