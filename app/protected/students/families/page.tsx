import Link from "next/link";

import { PageHeader } from "@/components/admin/page-header";
import { SectionCard } from "@/components/admin/section-card";
import { OfficeEmptyState } from "@/components/office/office-ui";
import { ConfirmSiblingGroupButton } from "@/app/protected/students/families/confirm-sibling-group-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { familyPaymentsEnabled } from "@/lib/config/feature-flags";
import { formatInr } from "@/lib/helpers/currency";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { getSiblingGroups } from "@/lib/students/data";
import type { SiblingGroupSummary } from "@/lib/students/types";
import { getViewSessionCookie } from "@/lib/session/cookie";
import { resolveViewSession } from "@/lib/session/resolver";
import { hasStaffPermission, requireStaffPermission } from "@/lib/supabase/session";
import { cn } from "@/lib/utils";

type FamiliesPageProps = {
  searchParams?: Promise<{
    session?: string;
    sessionLabel?: string;
    group?: string;
    suspect?: string;
    search?: string;
  }>;
};

function FamilyGroupRow({
  group,
  canConfirm,
  selected,
  canPayTogether,
  sessionLabel,
}: {
  group: SiblingGroupSummary;
  canConfirm: boolean;
  selected: boolean;
  canPayTogether: boolean;
  sessionLabel: string;
}) {
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card px-4 py-3",
        selected && "border-accent shadow-sm",
      )}
      id={group.existingFamilyGroupId ?? group.groupKey}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">
              {group.guardianPhone ? `Phone ${group.guardianPhone}` : "Phone-linked family"}
            </p>
            <Badge variant={group.confidence === "confirmed" ? "success" : "warning"}>
              {group.confidence === "confirmed" ? "Confirmed" : "Suspected"}
            </Badge>
            {group.fatherNameMatch ? <Badge variant="info">Father name match</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {group.studentCount} children · Family pending {formatInr(group.pendingTotal)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPayTogether && group.existingFamilyGroupId ? (
            <Button asChild size="sm">
              <Link href={withSession(`/protected/payments/family/${group.existingFamilyGroupId}`)}>Pay together</Link>
            </Button>
          ) : null}
          {group.confidence === "suspected" && canConfirm ? (
            <ConfirmSiblingGroupButton groupKey={group.groupKey} sessionLabel={group.sessionLabel} />
          ) : null}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-semibold">Child</th>
              <th className="py-2 pr-4 font-semibold">Class</th>
              <th className="py-2 pr-4 font-semibold">SR no</th>
              <th className="py-2 text-right font-semibold">Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {group.students.map((student) => (
              <tr key={student.studentId}>
                <td className="py-2 pr-4 font-medium text-foreground">
                  <Link href={withSession(`/protected/students/${student.studentId}`)} className="hover:underline">
                    {student.fullName}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-muted-foreground">{student.classLabel}</td>
                <td className="py-2 pr-4 text-muted-foreground">{student.admissionNo}</td>
                <td className="py-2 text-right tabular-nums text-foreground">
                  {formatInr(student.outstandingAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FamilyGroupSection({
  title,
  description,
  groups,
  canConfirm,
  selectedGroupId,
  selectedSuspectKey,
  selectedStudentId,
  canPayTogether,
  sessionLabel,
}: {
  title: string;
  description: string;
  groups: SiblingGroupSummary[];
  canConfirm: boolean;
  selectedGroupId: string | undefined;
  selectedSuspectKey: string | undefined;
  selectedStudentId: string | undefined;
  canPayTogether: boolean;
  sessionLabel: string;
}) {
  return (
    <SectionCard title={title} description={description}>
      {groups.length === 0 ? (
        <OfficeEmptyState
          title="No families in this section"
          detail="Sibling groups will appear here when two or more active students share a usable guardian phone."
        />
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <FamilyGroupRow
              key={group.existingFamilyGroupId ?? group.groupKey}
              group={group}
              canConfirm={canConfirm}
              canPayTogether={canPayTogether}
              selected={
                group.existingFamilyGroupId === selectedGroupId ||
                group.groupKey === selectedSuspectKey ||
                Boolean(selectedStudentId && group.studentIds.includes(selectedStudentId))
              }
              sessionLabel={sessionLabel}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

export default async function StudentFamiliesPage({ searchParams }: FamiliesPageProps) {
  const staff = await requireStaffPermission("students:view", { onDenied: "redirect" });
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const viewSession = await resolveViewSession({
    searchParamSession: resolvedSearchParams?.session ?? resolvedSearchParams?.sessionLabel,
    cookieSession: await getViewSessionCookie(),
  });
  const groups = await getSiblingGroups(viewSession.sessionLabel);
  const withSession = (href: string) => appendSessionParam(href, viewSession.sessionLabel);
  const canConfirm = hasStaffPermission(staff, "students:write");
  const canPayTogether = familyPaymentsEnabled && hasStaffPermission(staff, "payments:write");
  const confirmedGroups = groups.filter((group) => group.confidence === "confirmed");
  const suspectedGroups = groups.filter((group) => group.confidence === "suspected");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Students"
        title="Families"
        description="Review confirmed family groups and phone-matched sibling candidates."
        actions={
          <Button asChild variant="outline">
            <Link href={withSession("/protected/students")}>
              Back to Students
            </Link>
          </Button>
        }
      />

      <FamilyGroupSection
        title="Confirmed"
        description="Families already saved in the student family tables."
        groups={confirmedGroups}
        canConfirm={false}
        selectedGroupId={resolvedSearchParams?.group}
        selectedSuspectKey={resolvedSearchParams?.suspect}
        selectedStudentId={resolvedSearchParams?.search}
        canPayTogether={canPayTogether}
        sessionLabel={viewSession.sessionLabel}
      />

      <FamilyGroupSection
        title="Suspected"
        description="Active students in the same session who share a non-placeholder guardian phone."
        groups={suspectedGroups}
        canConfirm={canConfirm}
        selectedGroupId={resolvedSearchParams?.group}
        selectedSuspectKey={resolvedSearchParams?.suspect}
        selectedStudentId={resolvedSearchParams?.search}
        canPayTogether={false}
        sessionLabel={viewSession.sessionLabel}
      />
    </div>
  );
}
