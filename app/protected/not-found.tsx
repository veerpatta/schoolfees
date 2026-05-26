import Link from "next/link";
import { FileSearch } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ProtectedNotFound() {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-6 anim-fade-in">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
          <FileSearch className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Not found
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            We could not find that record
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The link you followed points to a record that no longer exists or was never created. The
            workspace itself is healthy — please go back and try again, or jump to the dashboard.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="primary">
              <Link href="/protected/dashboard">Back to dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/students">Open students</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
