"use client";

import { useState } from "react";
import { Banknote, Building2, ChevronDown, FileText, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";

const PAYMENT_MODES = [
  { value: "cash", label: "Cash", icon: Banknote, description: "Collect physical notes" },
  { value: "upi", label: "UPI", icon: Smartphone, description: "PhonePe, GPay, Paytm" },
  { value: "bank_transfer", label: "Bank Transfer", icon: Building2, description: "NEFT / RTGS / IMPS" },
  { value: "cheque", label: "Cheque", icon: FileText, description: "Cheque or DD" },
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
        className="flex h-11 w-full items-center justify-between rounded-lg border border-input/80 bg-white/88 px-3.5 py-2 text-sm shadow-sm transition-colors active:bg-slate-50 disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-slate-500" />
          <span className="truncate">{selected?.label ?? "Select mode"}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/40 px-2" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Close payment mode"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full animate-bottom-sheet-up rounded-t-2xl border border-slate-200 bg-white p-4 pb-[calc(1rem+var(--mobile-safe-area-bottom))] shadow-xl">
            <h2 className="text-base font-semibold text-slate-950">Payment Mode</h2>
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
                        ? "bg-sky-50 text-sky-900 ring-1 ring-sky-200"
                        : "bg-slate-50 text-slate-800 hover:bg-slate-100",
                    )}
                  >
                    <ModeIcon className={cn("size-5 shrink-0", isActive ? "text-sky-600" : "text-slate-500")} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{mode.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{mode.description}</span>
                    </span>
                    {isActive ? <span className="ml-auto size-2 rounded-full bg-sky-500" /> : null}
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
