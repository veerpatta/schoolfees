import { cn } from "@/platform/utils";

/**
 * One A4 sheet of a printed statement.
 *
 * Two rules this shell exists to enforce:
 *
 * - **Never a fixed height.** `min-h` plus `flex-col` lets a student with many
 *   installments and receipts push past one sheet and paginate, instead of
 *   silently clipping the receipts table. On a fee document that is a
 *   correctness bug, not a layout one. 273mm is A4's 297mm less the 12mm
 *   page margins declared in `app/globals.css`.
 * - **`print-color-adjust: exact`.** The document uses tinted tiles and status
 *   pills to carry meaning; browsers drop background colour at print unless the
 *   element opts in. Every tinted element also carries a border and a text
 *   colour, so a reader who turns "Background graphics" off in the print dialog
 *   still reads the same document.
 */
export function StatementPaper({
  children,
  className,
  isLastPage = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** A non-final sheet breaks to the next page at print. */
  isLastPage?: boolean;
}) {
  return (
    <section
      className={cn(
        "statement-print-page mx-auto flex w-full max-w-4xl flex-col bg-card px-6 py-6 text-foreground",
        "rounded-xl border border-border-strong shadow-sm",
        "print:min-h-[273mm] print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none",
        !isLastPage && "statement-page-break",
        className,
      )}
      style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}
    >
      {children}
    </section>
  );
}
