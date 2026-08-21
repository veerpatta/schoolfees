import { formatInr } from "@/platform/helpers/currency";
import { cn } from "@/platform/utils";

/**
 * The money band: the four figures the whole document exists to explain.
 *
 * Each tile carries a border and a text colour as well as its tint, so the
 * document still reads when a printer drops background graphics.
 *
 * "Still payable" is fees plus any late fee — what the counter can actually
 * collect — and its hint spells the split, because a late fee is never a fee
 * and must never be presented as one.
 */
function Tile({
  label,
  amount,
  hint,
  tone,
}: {
  label: string;
  amount: number;
  hint: string;
  tone: "neutral" | "success" | "accent" | "danger";
}) {
  const tones = {
    neutral: "border-border-strong",
    success: "border-success-soft-foreground/35 bg-success-soft text-success-soft-foreground",
    accent: "border-accent-soft-foreground/35 bg-accent-soft text-accent-soft-foreground",
    danger: "border-destructive-soft-foreground/35 bg-destructive-soft text-destructive-soft-foreground",
  } as const;

  return (
    <div className={cn("rounded-[9px] border px-2.5 py-2", tones[tone])}>
      <p
        className={cn(
          "text-[10px] font-bold uppercase tracking-[0.1em]",
          tone === "neutral" && "text-muted-foreground",
        )}
      >
        {label}
      </p>
      <p className="font-display-money mt-[3px] text-[26px] font-bold leading-[1.1] tracking-[-0.02em]">
        {formatInr(amount)}
      </p>
      <p className={cn("mt-0.5 text-[11px]", tone === "neutral" && "text-muted-foreground")}>
        {hint}
      </p>
    </div>
  );
}

export function StatementKpiTiles({
  totalCharged,
  paidInCash,
  writtenOff,
  feesPending,
  lateFeePending,
  stillPayable,
  chargedHint,
  paidHint,
}: {
  totalCharged: number;
  paidInCash: number;
  writtenOff: number;
  feesPending: number;
  lateFeePending: number;
  stillPayable: number;
  chargedHint: string;
  paidHint: string;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 py-2.5">
      <Tile label="Total charged" amount={totalCharged} hint={chargedHint} tone="neutral" />
      <Tile label="Paid in cash" amount={paidInCash} hint={paidHint} tone="success" />
      <Tile label="Written off" amount={writtenOff} hint="not counted as paid" tone="accent" />
      <Tile
        label="Still payable"
        amount={stillPayable}
        hint={
          lateFeePending > 0
            ? `${formatInr(feesPending)} fees + ${formatInr(lateFeePending)} late fee`
            : "fees still owed"
        }
        tone="danger"
      />
    </div>
  );
}
