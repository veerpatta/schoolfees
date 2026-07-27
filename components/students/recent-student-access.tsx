"use client";

import Link from "next/link";
import { Clock3, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { StudentAvatar } from "@/components/students/student-avatar";
import { StudentRowCollectButton } from "@/components/students/student-row-collect-button";
import { appendSessionParam } from "@/lib/navigation/session-href";
import { getRecentlyViewedStudents } from "@/lib/students/list-view-model";
import type { StudentListItem } from "@/lib/students/types";

type RecentStudentAccessProps = {
  students: StudentListItem[];
  lastViewedByUser: Record<string, string>;
  sessionLabel: string;
  returnTo: string;
  canCollectPayments: boolean;
};

export function RecentStudentAccess({
  students,
  lastViewedByUser,
  sessionLabel,
  returnTo,
  canCollectPayments,
}: RecentStudentAccessProps) {
  const t = useTranslations("Students");
  const recentStudents = getRecentlyViewedStudents({
    students,
    lastViewedByUser,
  });

  if (recentStudents.length === 0) return null;

  return (
    <section aria-labelledby="recent-students-title" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2
            id="recent-students-title"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("recentStudentsTitle")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("recentStudentsDescription")}</p>
        </div>
      </div>
      <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2 md:grid md:grid-cols-2 md:overflow-visible xl:grid-cols-5">
        {recentStudents.map((student) => {
          const profileHref = appendSessionParam(
            `/protected/students/${student.id}?returnTo=${encodeURIComponent(returnTo)}`,
            sessionLabel,
          );
          const canCollect =
            canCollectPayments &&
            student.status === "active" &&
            student.duesStatus === "generated" &&
            student.outstandingAmount > 0;

          return (
            <article
              key={student.id}
              className="min-w-[250px] snap-start rounded-xl border border-border bg-card p-3 shadow-sm md:min-w-0"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <StudentAvatar
                  photoPath={student.photoPath}
                  fullName={student.fullName}
                  size="sm"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {student.fullName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {student.admissionNo} · {student.classLabel}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Link
                  href={profileHref}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-2"
                >
                  <UserRound className="size-3.5" aria-hidden="true" />
                  {t("recentOpenProfile")}
                </Link>
                {canCollect ? (
                  <StudentRowCollectButton
                    studentId={student.id}
                    studentLabel={student.fullName}
                    classLabel={student.classLabel}
                    variant="primary"
                    className="min-h-11"
                  />
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
