"use client";

import { Button } from "@/ui/primitives/button";

export function PrintReportButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.print()}
    >
      Print view
    </Button>
  );
}
