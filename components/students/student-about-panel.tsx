import { Section } from "@/components/ui/section";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
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

type AboutStudent = {
  fullName: string;
  admissionNo: string;
  dateOfBirth: string | null;
  address: string | null;
  status: string;
  studentStatusLabel: string;
  fatherName: string | null;
  motherName: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  transportRouteLabel: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type AboutLedger = {
  payments: unknown[];
  paymentOptions: unknown[];
  adjustments: unknown[];
} | null;

type StudentAboutPanelProps = {
  student: AboutStudent;
  ledger: AboutLedger;
  latestReceiptNumber: string | null;
};

export function StudentAboutPanel({ student, ledger, latestReceiptNumber }: StudentAboutPanelProps) {
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
        <div className="rounded-xl border border-border bg-surface-2 px-4 py-4 text-sm text-foreground">
          {readValue(student.notes)}
        </div>
      </Section>

      <Section title="Record history" description="High-level record activity.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Created</p>
            <p className="mt-2 text-sm text-foreground">{formatDateTime(student.createdAt)}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Last updated</p>
            <p className="mt-2 text-sm text-foreground">{formatDateTime(student.updatedAt)}</p>
          </div>
        </div>
        {ledger ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Payment rows</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">{ledger.paymentOptions.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Adjustment rows</p>
              <p className="mt-2 text-lg font-semibold tabular-nums text-foreground">{ledger.adjustments.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Latest receipt</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{latestReceiptNumber ?? "-"}</p>
            </div>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
