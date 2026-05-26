"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, Building2, ChevronDown, FileText, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";

type PaymentMode = {
  value: "cash" | "upi" | "bank_transfer" | "cheque";
  labelKey: "modeCash" | "modeUpi" | "modeBankTransfer" | "modeCheque";
  hintKey: "modeCashHint" | "modeUpiHint" | "modeBankTransferHint" | "modeChequeHint";
  icon: typeof Banknote;
};

const PAYMENT_MODES: readonly PaymentMode[] = [
  { value: "cash", labelKey: "modeCash", hintKey: "modeCashHint", icon: Banknote },
  { value: "upi", labelKey: "modeUpi", hintKey: "modeUpiHint", icon: Smartphone },
  { value: "bank_transfer", labelKey: "modeBankTransfer", hintKey: "modeBankTransferHint", icon: Building2 },
  { value: "cheque", labelKey: "modeCheque", hintKey: "modeChequeHint", icon: FileText },
] as const;

type MobilePaymentModeSheetProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function MobilePaymentModeSheet({
  value,
  onChange,
  disabled,
}: MobilePaymentModeSheetProps) {
  const t = useTranslations("Payments");
  const [open, setOpen] = useState(false);
  const selected = PAYMENT_MODES.find((mode) => mode.value === value);
  const Icon = selected?.icon ?? Banknote;

  function selectMode(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-11 w-full items-center justify-between rounded-lg border border-input/80 bg-card/88 px-3.5 py-2 text-sm shadow-sm transition-colors active:bg-surface-2 disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{selected ? t(selected.labelKey) : t("modeSelectFallback")}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-subtle-foreground" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end bg-foreground/30 px-2" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label={t("modeSheetCloseAria")}
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full anim-slide-up rounded-t-2xl border border-border bg-card p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl">
            <h2 className="text-base font-semibold text-foreground">{t("modeSheetTitle")}</h2>
            <div className="mt-4 space-y-2">
              {PAYMENT_MODES.map((mode) => {
                const ModeIcon = mode.icon;
                const isActive = mode.value === value;

                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => selectMode(mode.value)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-colors active:scale-[0.98]",
                      isActive
                        ? "bg-info-soft text-info-soft-foreground ring-1 ring-ring/40"
                        : "bg-surface-2 text-foreground hover:bg-surface-2",
                    )}
                  >
                    <ModeIcon className={cn("size-5 shrink-0", isActive ? "text-info" : "text-muted-foreground")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{t(mode.labelKey)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{t(mode.hintKey)}</span>
                    </span>
                    {isActive ? <span className="ml-auto size-2 rounded-full bg-info" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
