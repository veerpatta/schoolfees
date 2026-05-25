import Link from "next/link";
import { formatInr } from "@/lib/helpers/currency";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { LinkSiblingTrigger } from "@/components/students/link-sibling-trigger";
import { appendSessionParam } from "@/lib/navigation/session-href";
import type { StudentFamilyMemberDetail } from "@/lib/students/data";

type StudentFamilyPanelProps = {
  studentId: string;
  familyGroupId: string | null;
  confidence: "confirmed" | "suspected" | null;
  members: StudentFamilyMemberDetail[];
  sessionLabel: string;
  canLinkSibling?: boolean;
  currentStudent?: {
    fullName: string;
    admissionNo: string;
    classLabel: string;
    fatherName: string | null;
    primaryPhone: string | null;
  };
};

export function StudentFamilyPanel({
  studentId,
  familyGroupId,
  confidence,
  members,
  sessionLabel,
  canLinkSibling = false,
  currentStudent,
}: StudentFamilyPanelProps) {
  const siblings = members.filter((m) => !m.isSelf);
  const linkSiblingTrigger =
    canLinkSibling && currentStudent ? (
      <LinkSiblingTrigger
        studentId={studentId}
        studentLabel={currentStudent.fullName}
        studentAdmissionNo={currentStudent.admissionNo}
        studentClassLabel={currentStudent.classLabel}
        studentFatherName={currentStudent.fatherName}
        studentPhone={currentStudent.primaryPhone}
        sessionLabel={sessionLabel}
        excludeStudentIds={members.map((m) => m.id)}
      />
    ) : null;

  if (siblings.length === 0) {
    return (
      <Section title="Family & Siblings" description="Sibling grouping details." variant="card" padding="tight">
        <div className="space-y-3">
          <div className="text-center py-4 text-xs text-muted-foreground">
            No siblings linked yet for this session. Use the button below to link an existing student
            as a sibling.
          </div>
          {linkSiblingTrigger ? (
            <div className="flex justify-center">{linkSiblingTrigger}</div>
          ) : null}
        </div>
      </Section>
    );
  }

  // Calculate family totals
  const totalOutstanding = members.reduce((sum, m) => sum + (m.financials?.outstanding ?? 0), 0);
  const totalDue = members.reduce((sum, m) => sum + (m.financials?.totalDue ?? 0), 0);
  const totalPaid = members.reduce((sum, m) => sum + (m.financials?.totalPaid ?? 0), 0);
  const withSession = (href: string) => appendSessionParam(href, sessionLabel);

  return (
    <Section title="Family & Siblings" description="Consolidated sibling dashboard." variant="card" padding="tight">
      <div className="space-y-4">
        {/* Confidence Badge Box */}
        <div className={`rounded-lg p-3 text-xs ${
          confidence === "confirmed" 
            ? "bg-success-soft text-success-soft-foreground" 
            : "bg-warning-soft text-warning-soft-foreground"
        }`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wider text-[10px]">
              {confidence === "confirmed" ? "Confirmed Family Group" : "Suspected Siblings"}
            </span>
            <span className="text-[10px] opacity-85">Session {sessionLabel}</span>
          </div>
          <p className="mt-1 leading-relaxed">
            {confidence === "confirmed" 
              ? "All siblings are linked under a verified family group." 
              : "Matching phone number detected. Sibling grouping is unverified."}
          </p>
        </div>

        {/* Members List */}
        <div className="divide-y divide-border border-y border-border">
          {members.map((member) => {
            const isPending = (member.financials?.outstanding ?? 0) > 0;
            return (
              <div 
                key={member.id} 
                className={`py-2 flex items-center justify-between gap-3 text-sm ${
                  member.isSelf ? "bg-accent-soft/30 -mx-3 px-3 rounded-sm" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Link 
                      href={withSession(`/protected/students/${member.id}`)}
                      className={`font-medium truncate hover:underline ${
                        member.isSelf ? "text-foreground font-semibold" : "text-primary"
                      }`}
                    >
                      {member.fullName}
                    </Link>
                    {member.isSelf && (
                      <span className="inline-flex items-center rounded-full bg-accent/20 px-1.5 py-0.2 text-[9px] font-medium text-accent-foreground">
                        Self
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    SR {member.admissionNo} • {member.classLabel}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-semibold ${isPending ? "text-review" : "text-success"}`}>
                    {member.financials ? formatInr(member.financials.outstanding) : "₹0"}
                  </span>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {isPending ? "Pending" : "Paid"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Financial Summary */}
        <div className="rounded-lg bg-surface-2 p-3 text-xs space-y-2">
          <p className="font-semibold text-foreground uppercase tracking-wider text-[10px]">Family Dues Summary</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Expected:</span>
            <span className="font-medium text-foreground">{formatInr(totalDue)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Paid:</span>
            <span className="font-medium text-foreground">{formatInr(totalPaid)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
            <span className="text-foreground">Outstanding Dues:</span>
            <span className={totalOutstanding > 0 ? "text-review" : "text-success"}>
              {formatInr(totalOutstanding)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid gap-2">
          {confidence === "confirmed" && familyGroupId ? (
            <>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link
                  href={withSession(`/protected/students/family/${encodeURIComponent(familyGroupId)}/statement`)}
                  target="_blank"
                >
                  Print Family Statement
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline" className="w-full">
                <Link
                  href={withSession(
                    `/protected/students/family/${encodeURIComponent(familyGroupId)}/receipts?print=1`,
                  )}
                  target="_blank"
                >
                  Reprint all family receipts
                </Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link href={withSession(`/protected/students/families?search=${encodeURIComponent(studentId)}`)}>
                Confirm Sibling Group
              </Link>
            </Button>
          )}
          {linkSiblingTrigger}
        </div>
      </div>
    </Section>
  );
}
