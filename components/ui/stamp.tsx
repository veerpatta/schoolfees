import { cn } from "@/lib/utils";

/**
 * The rubber stamp used across receipts, statements and student documents.
 *
 * There were five of these, copy-pasted: two in receipt-document-v3, one in v2,
 * one in the master statement and one in the family statement. Each carried the
 * rotation, border weight and colour inline as hard-coded `hsl(...)` literals,
 * which meant they drifted in size and opacity AND ignored dark mode entirely —
 * a near-black stamp on a near-black page. `lib/design/office-tokens.ts`
 * documented surface / action / status / geometry groups but had nothing for
 * paper marks, so there was no token to reach for.
 *
 * Colours here are theme variables, so a stamp reads correctly on screen in
 * either theme. Print keeps the ink dark regardless, because a stamp that
 * inverts on paper is a stamp nobody can photocopy.
 */

export type StampVariant =
  | "paid"
  | "year-cleared"
  | "void"
  | "draft"
  | "advance"
  | "closed-as-discount";

export type StampSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<StampVariant, string> = {
  paid: "border-success-soft-foreground text-success-soft-foreground",
  "year-cleared":
    "border-success-soft-foreground bg-success-soft text-success-soft-foreground",
  void: "border-destructive text-destructive",
  draft: "border-muted-foreground text-muted-foreground",
  advance: "border-accent-soft-foreground bg-accent-soft text-accent-soft-foreground",
  "closed-as-discount":
    "border-warning-soft-foreground bg-warning-soft text-warning-soft-foreground",
};

const SIZE_CLASSES: Record<StampSize, string> = {
  sm: "px-2 py-0.5 text-[10px] border-2",
  md: "px-3 py-1 text-[11px] border-[2.5px]",
  lg: "px-4 py-1.5 text-[15px] border-[3px]",
};

export type StampProps = {
  variant: StampVariant;
  children: React.ReactNode;
  size?: StampSize;
  /**
   * Rotation in degrees. A stamp sits slightly askew because a real one does;
   * pass 0 for a badge that has to line up with adjacent text.
   */
  rotate?: number;
  className?: string;
};

export function Stamp({
  variant,
  children,
  size = "md",
  rotate = -7,
  className,
}: StampProps) {
  return (
    <div
      // Decorative: the same fact is always stated in the surrounding text, so
      // a screen reader announcing "PAID" twice would be noise.
      aria-hidden="true"
      style={{ transform: `rotate(${rotate}deg)` }}
      className={cn(
        "inline-block rounded-md font-extrabold uppercase tracking-[0.1em] opacity-90",
        "print:opacity-100 print:text-black print:border-black",
        SIZE_CLASSES[size],
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
