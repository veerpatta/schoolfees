"use client";

import { formatInr } from "@/lib/helpers/currency";

/**
 * The receipt screen, in its "still posting" state.
 *
 * Collecting cash at the counter used to have a dead interval. The mobile
 * fast-post path (cash ≤ ₹15,000, no discount) skips the confirm sheet, and the
 * confirm sheet was the ONLY component wired to the pending flag — so the clerk
 * pressed Collect and nothing on screen changed at all until the receipt
 * animation arrived a second or two later. Clerks pressed again.
 *
 * The fix is not a spinner bolted next to the button. This IS the receipt
 * screen: same bottom-sheet entrance (`animate-bottom-sheet-up`, 220ms), same
 * layout, same position for the check mark and the amount. It slides up the
 * instant the button is pressed, holding a pulsing ring where the check will
 * draw and the real amount already legible. When the post lands,
 * `SuccessReceiptSheet` takes its place in the same slot and the ring becomes
 * the drawn check. There is no second screen and no dead time — the animation
 * staff already recognise becomes the wait itself.
 *
 * Deliberately NOT optimistic: no receipt number, no "saved" claim, nothing a
 * failed post would have to retract. The design system bans optimistic UI for
 * financial mutations (docs/design/design-system.md §5.7); this shows only what
 * is already true — this amount, for this student, is being posted.
 */
export function PostingReceiptSheet({
  studentFullName,
  amount,
  slow = false,
}: {
  studentFullName: string;
  amount: number;
  /** After ~8s, say something rather than spinning silently. */
  slow?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-center max-md:items-stretch max-md:bg-nav md:items-center md:bg-foreground/30 md:px-4"
      data-posting-receipt
    >
      <div
        role="status"
        aria-live="polite"
        aria-label="Saving payment"
        className="max-h-[92dvh] w-full animate-bottom-sheet-up overflow-y-auto rounded-t-2xl border border-border bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl max-md:flex max-md:h-[calc(100dvh-var(--keyboard-offset,0px))] max-md:max-h-none max-md:flex-col max-md:overflow-hidden max-md:rounded-none max-md:border-0 max-md:bg-nav max-md:p-0 max-md:pb-0 max-md:text-nav-foreground md:max-w-xl md:rounded-xl md:p-5"
      >
        <div className="flex items-center gap-2.5 max-md:flex-none max-md:px-4 max-md:pt-4">
          {/* Sits exactly where SuccessCheckMark will, at the same size, so the
              swap reads as the ring resolving into the check. */}
          <span
            aria-hidden="true"
            className="anim-check-halo inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2"
          >
            <span className="size-5 animate-spin rounded-full border-2 border-border border-t-accent" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-foreground max-md:text-nav-foreground">
              Saving payment…
            </h2>
            <p className="text-sm text-muted-foreground max-md:text-nav-muted">
              {slow ? "Still saving — keep this screen open." : "Keep this screen open."}
            </p>
          </div>
        </div>

        <div className="mt-4 max-md:flex-1 max-md:overflow-y-auto max-md:px-4">
          <div className="rounded-xl border border-border bg-surface-2/60 px-4 py-5 text-center max-md:border-nav-border max-md:bg-nav-muted/10">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground max-md:text-nav-muted">
              {studentFullName}
            </p>
            {/* The amount is known and true right now, so show it. Only the
                receipt number is withheld — that is the server's to assign. */}
            <p className="mt-2 font-mono text-3xl font-bold tabular-nums text-foreground max-md:text-nav-foreground">
              {formatInr(amount)}
            </p>
            <p className="anim-shimmer mx-auto mt-3 h-3 w-32 rounded bg-surface-2" aria-hidden="true" />
          </div>

          <div className="mt-3 space-y-2" aria-hidden="true">
            <span className="anim-shimmer block h-3 w-full rounded bg-surface-2" />
            <span className="anim-shimmer block h-3 w-4/5 rounded bg-surface-2" />
          </div>
        </div>

        <div className="mt-4 max-md:flex-none max-md:px-4 max-md:pb-[calc(1rem+var(--mobile-safe-area-bottom))]">
          <span
            aria-hidden="true"
            className="block h-[3px] w-full overflow-hidden rounded-full bg-surface-2"
          >
            <span className="anim-route-progress block h-full w-3/5 rounded-full bg-accent" />
          </span>
        </div>
      </div>
    </div>
  );
}
