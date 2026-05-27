"use client";

import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Money } from "@/components/ui/money";
import { MoneyGlossarySheet } from "@/components/ui/money-glossary";
import { getMoneyTerm, type MoneyTermKey } from "@/lib/money/glossary";
import { cn } from "@/lib/utils";

type Props = {
  /** Glossary key. Resolved at click time — opens the glossary anchored to this term. */
  termKey: MoneyTermKey;
  /** Visible label next to the money. Defaults to the term's own label. */
  label?: ReactNode;
  /** Money value, or omit to render the term as a definable label only. */
  value?: number | null | undefined;
  size?: "xs" | "sm" | "md" | "lg";
  tone?: "auto" | "neutral" | "muted" | "success" | "danger" | "warning";
  signed?: boolean;
  /** Layout: row (label left, value right) or column (label above value). */
  layout?: "row" | "column" | "inline";
  className?: string;
};

const sizeToText: Record<NonNullable<Props["size"]>, string> = {
  xs: "text-[10px]",
  sm: "text-xs",
  md: "text-xs",
  lg: "text-sm",
};

/**
 * A money figure with its label and an info button that opens the glossary
 * anchored to the relevant term. Use everywhere a money number could be
 * misread — KPI cards, table summary rows, balance lines.
 */
export function MoneyWithDefinition({
  termKey,
  label,
  value,
  size = "md",
  tone = "neutral",
  signed = false,
  layout = "column",
  className,
}: Props) {
  const term = getMoneyTerm(termKey);
  const [open, setOpen] = useState(false);
  const resolvedLabel = label ?? term.label;

  const labelEl = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={cn(
        "group inline-flex items-center gap-1 text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:underline",
        sizeToText[size],
      )}
      aria-label={`What does '${term.label}' mean?`}
    >
      <span className="uppercase tracking-[0.08em]">{resolvedLabel}</span>
      <Info
        className="size-3 text-muted-foreground/60 transition-colors group-hover:text-foreground/70"
        aria-hidden="true"
      />
    </button>
  );

  const valueEl =
    value === undefined ? null : (
      <Money
        value={value}
        size={size === "xs" ? "xs" : size === "sm" ? "sm" : size === "lg" ? "lg" : "md"}
        tone={tone}
        signed={signed}
      />
    );

  return (
    <>
      <div
        className={cn(
          layout === "row"
            ? "flex items-baseline justify-between gap-3"
            : layout === "inline"
              ? "inline-flex items-baseline gap-2"
              : "flex flex-col gap-0.5",
          className,
        )}
        data-money-with-definition={termKey}
      >
        {labelEl}
        {valueEl}
      </div>
      <MoneyGlossarySheet open={open} onClose={() => setOpen(false)} anchor={termKey} />
    </>
  );
}
