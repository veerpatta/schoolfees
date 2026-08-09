"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { ImportMode } from "@/lib/import/types";
import type { StudentSessionOption } from "@/lib/students/types";

// The dialog body is 21 KB of source -- an upload flow, a validation preview
// and a commit step -- behind a button most visits never press. Loading it on
// first press keeps it out of the Students bundle entirely.
const StudentBulkImportDialogBody = dynamic(
  () =>
    import("@/components/students/student-bulk-import-dialog-body").then(
      (mod) => mod.StudentBulkImportDialogBody,
    ),
  { ssr: false },
);

export function StudentBulkImportDialogTrigger({
  sessionOptions,
  defaultSessionLabel,
}: {
  sessionOptions: StudentSessionOption[];
  defaultSessionLabel: string;
}) {
  const [openMode, setOpenMode] = useState<ImportMode | null>(null);

  return (
    <>
      <Button variant="outline" onClick={() => setOpenMode("add")}>
        Bulk Add Students
      </Button>
      <Button variant="outline" onClick={() => setOpenMode("update")}>
        Bulk Update Existing Students
      </Button>

      {openMode ? (
        <StudentBulkImportDialogBody
          mode={openMode}
          sessionOptions={sessionOptions}
          defaultSessionLabel={defaultSessionLabel}
          onClose={() => setOpenMode(null)}
        />
      ) : null}
    </>
  );
}
