"use client";

import { useState } from "react";
import { Download, Loader2, MessageCircle, Share2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import { formatInr } from "@/lib/helpers/currency";
import {
  PhoneActionMenu,
  buildStudentPhoneEntries,
} from "@/components/students/phone-chooser";

type ShareFeeWhatsAppProps = {
  studentId: string;
  studentName: string;
  /** Present when the student belongs to a confirmed family group. */
  familyGroupId: string | null;
  fatherPhone: string | null;
  motherPhone: string | null;
  pendingAmount: number;
};

type Scope = "student" | "family";

function waLink(phone: string, message: string): string | null {
  const digits = phone.replace(/\D+/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export function ShareFeeWhatsApp({
  studentId,
  studentName,
  familyGroupId,
  fatherPhone,
  motherPhone,
  pendingAmount,
}: ShareFeeWhatsAppProps) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<Scope>("student");
  const [busy, setBusy] = useState(false);
  // Holds the generated PDF when the native share sheet is unavailable so the
  // staff member can still download it and pick a number for WhatsApp.
  const [fallback, setFallback] = useState<{ blobUrl: string; fileName: string } | null>(null);

  const phoneEntries = buildStudentPhoneEntries({ fatherPhone, motherPhone });

  const shareText =
    pendingAmount > 0
      ? `Fee statement for ${studentName}${scope === "family" ? " and siblings" : ""}. Pending dues: ${formatInr(pendingAmount)}. — School office`
      : `Fee statement for ${studentName}${scope === "family" ? " and siblings" : ""}. All dues are settled. — School office`;

  function close() {
    if (busy) return;
    if (fallback) URL.revokeObjectURL(fallback.blobUrl);
    setFallback(null);
    setOpen(false);
  }

  async function handleShare() {
    setBusy(true);
    setFallback(null);
    try {
      const url =
        scope === "family" && familyGroupId
          ? `/protected/students/family/${familyGroupId}/fee-pdf`
          : `/protected/students/${studentId}/fee-pdf`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Could not generate the fee PDF.");
      }
      const blob = await response.blob();
      const fileName =
        scope === "family" ? `family-fee-statement.pdf` : `fee-statement-${studentName}.pdf`.replace(/\s+/g, "-");
      const file = new File([blob], fileName, { type: "application/pdf" });

      const shareData = {
        files: [file],
        title: "Fee statement",
        text: shareText,
      } satisfies ShareData;

      if (typeof navigator !== "undefined" && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        close();
        return;
      }

      // Fallback (desktop / unsupported): download the PDF and let staff open
      // WhatsApp for a chosen number with the message pre-filled.
      const blobUrl = URL.createObjectURL(blob);
      setFallback({ blobUrl, fileName });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") {
        // User dismissed the native share sheet — not an error.
        close();
        return;
      }
      toast({
        title: "Share failed",
        description: error instanceof Error ? error.message : "Unable to share the fee statement.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-xs no-print">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Share fee details</h2>
          <p className="text-xs text-muted-foreground">
            Send a clear fee statement PDF (with receipts) to the parent on WhatsApp.
          </p>
        </div>
        <Button type="button" size="sm" className="gap-2" onClick={() => setOpen(true)}>
          <Share2 className="size-4" aria-hidden="true" />
          Share on WhatsApp
        </Button>
      </div>

      <Sheet open={open} onClose={close} title="Share fee statement" size="md">
        <div className="space-y-4 pt-1">
          {familyGroupId ? (
            <div>
              <p className="text-xs font-medium text-muted-foreground">What to share</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setScope("student")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${
                    scope === "student"
                      ? "border-accent bg-accent-soft/40 font-semibold"
                      : "border-border hover:bg-surface-2"
                  }`}
                >
                  This child
                </button>
                <button
                  type="button"
                  onClick={() => setScope("family")}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-left text-sm ${
                    scope === "family"
                      ? "border-accent bg-accent-soft/40 font-semibold"
                      : "border-border hover:bg-surface-2"
                  }`}
                >
                  <Users className="size-3.5" aria-hidden="true" />
                  Whole family
                </button>
              </div>
            </div>
          ) : null}

          {phoneEntries.length > 0 ? (
            <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
              <p className="font-medium text-muted-foreground">Numbers on file</p>
              <ul className="mt-1 space-y-0.5">
                {phoneEntries.map((entry) => (
                  <li key={entry.phone} className="flex items-center justify-between">
                    <span className="text-foreground">{entry.label}</span>
                    <span className="font-mono text-muted-foreground">{entry.phone}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-muted-foreground">
                When WhatsApp opens, pick the contact for the number above.
              </p>
            </div>
          ) : (
            <div className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
              No phone number is on file for this student. You can still generate the PDF and share it manually.
            </div>
          )}

          {fallback ? (
            <div className="space-y-2 rounded-lg border border-border bg-surface-2 px-3 py-3">
              <p className="text-xs text-muted-foreground">
                This device can&apos;t attach files directly. Download the PDF, then open WhatsApp and attach it.
              </p>
              <a
                href={fallback.blobUrl}
                download={fallback.fileName}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Download className="size-4" aria-hidden="true" /> Download PDF
              </a>
              {phoneEntries.length > 0 ? (
                <div>
                  <PhoneActionMenu
                    entries={phoneEntries}
                    menuLabel="Open WhatsApp for"
                    onSelect={(phone) => {
                      const href = waLink(phone, shareText);
                      if (href) window.open(href, "_blank", "noreferrer");
                    }}
                  >
                    <Button type="button" size="sm" variant="outline" className="gap-1.5">
                      <MessageCircle className="size-4" aria-hidden="true" /> Open WhatsApp
                    </Button>
                  </PhoneActionMenu>
                </div>
              ) : null}
            </div>
          ) : (
            <Button type="button" className="w-full gap-2" onClick={handleShare} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Preparing PDF…
                </>
              ) : (
                <>
                  <Share2 className="size-4" aria-hidden="true" /> Generate &amp; share PDF
                </>
              )}
            </Button>
          )}
        </div>
      </Sheet>
    </section>
  );
}
