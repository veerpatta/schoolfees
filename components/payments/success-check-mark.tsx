"use client";

/**
 * The check DRAWS itself rather than popping in.
 *
 * A stroke resolving over ~320ms reads as "the system finished the work";
 * a scale-in reads as "a div appeared". This is the single highest-value
 * frame of the payment-collected moment, and it costs no JS at runtime —
 * the animation is pure CSS (`.anim-check-draw` / `.anim-check-halo` in
 * globals.css), so there are no timers to leak and reduced-motion is handled
 * by the existing global block, which renders the stroke already complete.
 *
 * `--check-path-length` matches the path's measured length so the dash
 * offset resolves exactly to zero.
 */
export function SuccessCheckMark({ className }: { className?: string }) {
  return (
    <span
      data-success-check
      className={`anim-check-halo inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-soft-foreground ${className ?? ""}`.trim()}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="size-5"
        style={{ ["--check-path-length" as string]: "24" }}
      >
        <path
          d="M5 12.5 10 17.5 19 7.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="anim-check-draw"
        />
      </svg>
    </span>
  );
}
