"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export function MasterStatementPrintActions({
  backHref,
}: {
  backHref: string;
}) {
  return (
    <div className="no-print flex flex-wrap items-center justify-end gap-2">
      <Button type="button" variant="outline" onClick={() => window.print()}>
        Print statement
      </Button>
      <Button asChild variant="secondary">
        <Link href={backHref}>Back to student</Link>
      </Button>
    </div>
  );
}
