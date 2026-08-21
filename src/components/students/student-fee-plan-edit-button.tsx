"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import {
  StudentFeePlanSheet,
  type StudentFeePlanSheetProps,
} from "@/components/students/student-fee-plan-sheet";
import { useMediaQuery } from "@/ui/hooks/use-media-query";

type StudentFeePlanEditButtonProps = Omit<
  StudentFeePlanSheetProps,
  "open" | "onClose"
>;

/**
 * Desktop-only entry point for the per-student fee plan editor.
 *
 * The surrounding Fee plan tab lives inside a `hidden md:block` wrapper, but
 * that is CSS hiding — the subtree is still in the phone's HTML and would still
 * hydrate. Gating on `useMediaQuery` keeps the editor genuinely off phones.
 * `useMediaQuery` returns false during hydration by design, so only a small
 * button appears after mount rather than a whole panel shifting the layout.
 */
export function StudentFeePlanEditButton(props: StudentFeePlanEditButtonProps) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);

  if (!isDesktop) {
    return null;
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Edit custom fees
      </Button>
      <StudentFeePlanSheet {...props} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
