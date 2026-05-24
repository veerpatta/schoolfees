"use client";

/**
 * Collect drawer — v1 "soft drawer" pattern.
 *
 * Opens a right-side Sheet showing the chosen student's identity and a
 * "Collect" CTA that routes into /protected/payments?studentId=…&returnTo=…
 * so the user lands in Payment Desk with the student pre-selected, posts,
 * then can be returned to where they were.
 *
 * Why a "soft drawer" (route push) instead of inline-mounting Payment Desk:
 * the production posting flow is mature, audited, and lives at one well-
 * tested route. Duplicating it inside a drawer would risk financial
 * regressions. The drawer provides the UX of context-preservation (you
 * confirm intent without losing the row you were on) without rewriting
 * the live form.
 *
 * A future Phase 3.5 can replace the route-push with an intercepting
 * route (`@drawer` parallel slot) once the posting flow is hardened.
 */

import { useRouter } from "next/navigation";

import { Sheet } from "@/components/ui/sheet";
import { useCollect } from "@/lib/payments/collect-context";

export function CollectDrawer() {
  const router = useRouter();
  const { intent, close } = useCollect();
  const open = intent !== null;

  const handleConfirm = () => {
    if (!intent) return;
    const params = new URLSearchParams({ studentId: intent.studentId });
    if (intent.returnTo) {
      params.set("returnTo", intent.returnTo);
    }
    const href = `/protected/payments?${params.toString()}`;
    close();
    router.push(href);
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      side="right"
      title="Collect payment"
      description="Open Payment Desk with this student pre-filled."
    >
      {intent ? (
        <div className="space-y-5">
          <section className="rounded-md border border-border bg-surface-2 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Student
            </p>
            <p className="mt-1 truncate text-lg font-semibold text-foreground">
              {intent.studentLabel ?? "Selected student"}
            </p>
            {intent.classLabel ? (
              <p className="text-sm text-muted-foreground">{intent.classLabel}</p>
            ) : null}
          </section>

          <p className="text-sm leading-6 text-muted-foreground">
            You&apos;ll land on Payment Desk with this student selected. After
            posting, the existing receipt flow runs unchanged — including
            print and audit trail.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus-ring"
            >
              Open Payment Desk
            </button>
            <button
              type="button"
              onClick={close}
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-2 focus-ring"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: Press Ctrl/Cmd + K from any page and type a student name to
            jump straight to a collect drawer.
          </p>
        </div>
      ) : null}
    </Sheet>
  );
}
