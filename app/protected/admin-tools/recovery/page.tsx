import Link from "next/link";
import { ExternalLink, MessageCircle, ReceiptText } from "lucide-react";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { OfficeNotice } from "@/components/office/office-ui";
import { Button } from "@/components/ui/button";
import { getRecoveryQueue } from "@/lib/recovery/data";
import {
  RECOVERY_STUDENT_STATUSES,
  type RecoveryStudentStatus,
} from "@/lib/recovery/types";
import { requireAnyStaffPermission } from "@/lib/supabase/session";

export const revalidate = 0;

const inr = (value: number) => `Rs ${value.toLocaleString("en-IN")}`;

const STATUS_TONE: Record<RecoveryStudentStatus, "warning" | "info"> = {
  left: "warning",
  graduated: "info",
  inactive: "info",
};

type RecoveryPageProps = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    session?: string;
    classId?: string;
  }>;
};

function normalizeStatus(value: string | undefined): RecoveryStudentStatus | undefined {
  return RECOVERY_STUDENT_STATUSES.includes(value as RecoveryStudentStatus)
    ? (value as RecoveryStudentStatus)
    : undefined;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export default async function RecoveryPage({ searchParams }: RecoveryPageProps) {
  await requireAnyStaffPermission(["finance:view", "fees:view", "defaulters:view"], {
    onDenied: "redirect",
  });

  const resolved = searchParams ? await searchParams : undefined;
  const status = normalizeStatus(resolved?.status);
  const sourceSessionLabel = resolved?.session?.trim() || undefined;
  const classId = resolved?.classId?.trim() || undefined;
  const query = resolved?.q?.trim() || undefined;

  const data = await getRecoveryQueue({
    query,
    statuses: status ? [status] : undefined,
    sourceSessionLabel,
    classId,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Tools"
        title="Left Students With Dues"
        description="Recover still-pending fees from students who have left, graduated, or gone inactive."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/protected/exports/left-student-dues">Export</Link>
          </Button>
        }
      />

      <OfficeNotice title="How recovery works" tone="info">
        These students are kept marked as left — collecting here does <strong>not</strong> re-enrol
        them or create new dues. Use <strong>Collect recovery payment</strong> to post against their
        existing pending installments through the guarded Payment Desk recovery mode.
      </OfficeNotice>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Students in queue" value={String(data.totalStudents)} />
        <Metric label="Total recoverable" value={inr(data.totalRemaining)} />
        <Metric label="Left" value={String(data.statusCounts.left)} />
        <Metric label="Graduated / inactive" value={String(data.statusCounts.graduated + data.statusCounts.inactive)} />
      </div>

      <SectionCard title="Filters" description="Search by admission no, name, or phone, and narrow by status, session, or class.">
        <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="search"
            name="q"
            defaultValue={query ?? ""}
            placeholder="SR / name / phone"
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm xl:col-span-2"
            aria-label="Search recovery queue"
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="left">Left</option>
            <option value="graduated">Graduated</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            name="session"
            defaultValue={sourceSessionLabel ?? ""}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
            aria-label="Filter by source session"
          >
            <option value="">All sessions</option>
            {data.sessionOptions.map((session) => (
              <option key={session} value={session}>
                {session}
              </option>
            ))}
          </select>
          <select
            name="classId"
            defaultValue={classId ?? ""}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
            aria-label="Filter by class"
          >
            <option value="">All classes</option>
            {data.classOptions.map((option) => (
              <option key={option.classId} value={option.classId}>
                {option.classLabel}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/protected/admin-tools/recovery">Reset</Link>
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title={`Recovery queue (${data.totalStudents})`}
        description="Sorted by largest outstanding. Posting allocates only to existing pending dues."
      >
        {data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No left students with pending dues match these filters.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-[0.06em] text-muted-foreground">
                  <th className="py-2 pr-3">Adm#</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Class</th>
                  <th className="py-2 pr-3">Source session</th>
                  <th className="py-2 pr-3 text-right">Remaining</th>
                  <th className="py-2 pr-3">Last payment</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const waMessage = encodeURIComponent(
                    `Dear Parent, our records show a pending balance of ${inr(row.totalRemaining)} for ${row.fullName} (Adm# ${row.admissionNo}). Kindly clear the dues at your earliest convenience. - VPPS Office`,
                  );
                  const waHref = row.phone
                    ? `https://wa.me/91${row.phone.replace(/\D/g, "").slice(-10)}?text=${waMessage}`
                    : null;

                  return (
                    <tr key={row.studentId} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 font-mono text-xs">{row.admissionNo}</td>
                      <td className="py-2 pr-3">
                        <span className="font-medium text-foreground">{row.fullName}</span>
                        {row.fatherName ? (
                          <span className="block text-xs text-muted-foreground">{row.fatherName}</span>
                        ) : null}
                        {row.hasCarryForward ? (
                          <span className="mt-1 inline-block rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Carry-forward
                          </span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3">
                        <StatusBadge label={row.status} tone={STATUS_TONE[row.status]} />
                      </td>
                      <td className="py-2 pr-3">{row.classLabel ?? "-"}</td>
                      <td className="py-2 pr-3">{row.sourceSessionLabel ?? "-"}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{inr(row.totalRemaining)}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {row.lastPaymentDate
                          ? new Date(row.lastPaymentDate).toLocaleDateString("en-IN")
                          : "-"}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Button asChild size="sm" className="h-8">
                            <Link href={`/protected/payments?studentId=${row.studentId}&mode=recovery`}>
                              Collect
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="icon" className="h-8 w-8" title="Open student">
                            <Link href={`/protected/students/${row.studentId}`}>
                              <ExternalLink className="size-4" />
                              <span className="sr-only">Open student</span>
                            </Link>
                          </Button>
                          <Button asChild variant="outline" size="icon" className="h-8 w-8" title="Statement">
                            <Link href={`/protected/students/${row.studentId}/statement`}>
                              <ReceiptText className="size-4" />
                              <span className="sr-only">Statement</span>
                            </Link>
                          </Button>
                          {waHref ? (
                            <Button asChild variant="outline" size="icon" className="h-8 w-8" title="WhatsApp reminder">
                              <a href={waHref} target="_blank" rel="noopener noreferrer">
                                <MessageCircle className="size-4" />
                                <span className="sr-only">WhatsApp reminder</span>
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
