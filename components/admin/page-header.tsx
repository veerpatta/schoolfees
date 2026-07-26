import { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Small label above the title (caps, tracked). */
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /**
   * Phone-only line under the title — a count, a status, a session ("214
   * showing", "Draft"). Falls back to `eyebrow`. Pass `false` for title only.
   */
  mobileEyebrow?: ReactNode | false;
  /**
   * Drop the phone title block. Use when the screen already opens with its own
   * hero (the Dashboard's ink band) and a second title would only push the
   * numbers below the fold.
   */
  hideOnMobile?: boolean;
  /** Phone-only: suppress the action cluster when it is desktop-shaped. */
  hideActionsOnMobile?: boolean;
  className?: string;
};

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  mobileEyebrow,
  hideOnMobile = false,
  hideActionsOnMobile = false,
  className,
}: PageHeaderProps) {
  const phoneEyebrow = mobileEyebrow === false ? null : (mobileEyebrow ?? eyebrow);

  return (
    <>
      {/* ── Phone (mobile app v2) ──────────────────────────────────────
          Every screen in the phone app opens with its own name. The sticky app
          bar above is 56px of chrome carrying the brand and the account — not
          the screen. Without this block a phone lands on a wall of cards with
          nothing saying where you are. */}
      {hideOnMobile ? null : (
        <header className={cn("flex flex-col gap-2.5 md:hidden print:hidden", className)}>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
            {phoneEyebrow ? (
              <p className="mt-0.5 text-[11.5px] font-medium text-muted-foreground">
                {phoneEyebrow}
              </p>
            ) : null}
          </div>
          {actions && !hideActionsOnMobile ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      )}

      {/* ── Tablet, desktop and print ─────────────────────────────────── */}
      <header
        className={cn(
          "hidden flex-col gap-3 pb-1 md:flex md:flex-row md:items-end md:justify-between md:gap-6 print:flex",
          className,
        )}
      >
        <div className="min-w-0 max-w-3xl">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-tight text-foreground md:text-[26px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 hidden text-sm leading-6 text-muted-foreground md:block">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 md:justify-end">
            {actions}
          </div>
        ) : null}
      </header>
    </>
  );
}
