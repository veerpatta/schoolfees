import { FamilyStatementMobile } from "@/modules/students/ui/statement/family-statement-mobile";
import { FamilyStatementPaper } from "@/modules/students/ui/statement/family-statement-paper";
import { buildStatementFamilyView } from "@/modules/students/domain/statement-view-model";
import type { getFamilyWorkspaceData } from "@/modules/students/data/workspace";

type FamilyWorkspace = Awaited<ReturnType<typeof getFamilyWorkspaceData>>;

type FamilyStatementDocumentProps = {
  familyGroup: FamilyWorkspace["familyGroup"];
  students: FamilyWorkspace["students"];
  /**
   * Today in IST, as a display string for the letterhead and an ISO date for
   * the overdue comparison. Passed in rather than read from the clock here, so
   * the rendered document is deterministic under test.
   */
  issuedOn: string;
  todayIso: string;
};

/**
 * The consolidated sibling statement, in its two forms — the same switch the
 * per-student statement uses. See `./master-statement-document.tsx` for why the
 * two renderings are separate files, and
 * `tests/ui/statement-mobile-overflow.test.ts` for the line that keeps the A4
 * layout off phones.
 */
export function FamilyStatementDocument({
  familyGroup,
  students,
  issuedOn,
  todayIso,
}: FamilyStatementDocumentProps) {
  if (!students || students.length === 0) {
    return null;
  }

  const view = buildStatementFamilyView({ familyGroup, students, todayIso });

  return (
    <>
      <div className="md:hidden print:hidden">
        <FamilyStatementMobile familyGroup={familyGroup} students={students} />
      </div>

      <div className="hidden md:block print:block">
        {view ? <FamilyStatementPaper view={view} issuedOn={issuedOn} /> : null}
      </div>
    </>
  );
}
