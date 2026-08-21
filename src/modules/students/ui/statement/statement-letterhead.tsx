import Image from "next/image";

import { Stamp } from "@/ui/primitives/stamp";
import { schoolProfile } from "@/platform/config/school";

/**
 * The document's letterhead: the school mark, who issued it, and what sheet
 * this is.
 *
 * The reference slot carries a real identifier — a student's SR number or the
 * family group's name — never a synthesised document number. Nothing on a fee
 * document should look like a record the office cannot look up.
 */
export function StatementLetterhead({
  docTitle,
  sessionLabel,
  issuedOn,
  identifier,
  pageLabel,
  isYearClear = false,
  compact = false,
  continuedFor,
}: {
  docTitle: string;
  sessionLabel: string;
  issuedOn: string;
  identifier: string;
  pageLabel: string;
  isYearClear?: boolean;
  /** The slimmer letterhead a continuation sheet gets. */
  compact?: boolean;
  continuedFor?: string;
}) {
  if (compact) {
    return (
      <header className="flex items-end justify-between gap-4 border-b-2 border-border-strong pb-2">
        <div>
          <p className="font-display text-[16px] font-bold leading-tight">{schoolProfile.name}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{continuedFor} · continued</p>
        </div>
        <p className="text-[11.5px] text-muted-foreground">
          {identifier} · {pageLabel}
        </p>
      </header>
    );
  }

  return (
    <header className="flex items-start justify-between gap-4 border-b-2 border-border-strong pb-2.5">
      <div className="flex min-w-0 items-start gap-3">
        <div className="box-border size-[46px] shrink-0 overflow-hidden rounded-lg border border-border-strong bg-surface p-[3px]">
          <Image
            src="/branding/veer-patta-school-logo.jpg"
            alt={`${schoolProfile.name} logo`}
            width={120}
            height={120}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <p className="font-display text-[19px] font-bold leading-[1.15] tracking-[-0.01em]">
            {schoolProfile.name}
          </p>
          {/* `address` is env-driven and defaults to empty — the receipts omit
              the line rather than print a stray separator, and so does this. */}
          <p className="mt-[3px] text-[12px] text-muted-foreground">
            {schoolProfile.address ? `${schoolProfile.address} · ` : ""}Fee office
          </p>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="flex items-center justify-end gap-2">
          {isYearClear ? (
            <Stamp variant="year-cleared" size="sm" rotate={-4}>
              Year Cleared
            </Stamp>
          ) : null}
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent">{docTitle}</p>
        </div>
        <p className="mt-1 text-[13px] font-semibold">Session {sessionLabel}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Issued {issuedOn} · {identifier} · {pageLabel}
        </p>
      </div>
    </header>
  );
}
