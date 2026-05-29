"use client";

import { useCallback, useEffect, useState } from "react";
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

type PreparedPdf = { blob: Blob; fileName: string };

function waLink(phone: string, message: string): string | null {
  const digits = phone.replace(/\D+/g, "");
  if (digits.length < 10) return null;
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the download a tick to start before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
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
  const [preparing, setPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PreparedPdf | null>(null);
  // Set once a native share isn't possible/failed, so staff can still download
  // the PDF and open WhatsApp for a chosen number.
  const [useFallback, setUseFallback] = useState(false);

  const phoneEntries = buildStudentPhoneEntries({ fatherPhone, motherPhone });

  const shareText =
    pendingAmount > 0
      ? `Fee statement for ${studentName}${scope === "family" ? " and siblings" : ""}. Pending dues: ${formatInr(pendingAmount)}. — School office`
      : `Fee statement for ${studentName}${scope === "family" ? " and siblings" : ""}. All dues are settled. — School office`;

  // Pre-fetch the PDF as soon as the sheet opens (and whenever the scope
  // changes). Fetching ahead of time means the actual `navigator.share` call
  // can run synchronously inside the button click, preserving the transient
  // user activation that mobile browsers (esp. iOS Safari) require — fetching
  // inside the click handler would consume that activation and the share would
  // be rejected with "could not share".
  const fetchPdf = useCallback(
    async (signal: AbortSignal) => {
      setPreparing(true);
      setPrepareError(null);
      setPdf(null);
      try {
        const url =
          scope === "family" && familyGroupId
            ? `/protected/students/family/${familyGroupId}/fee-pdf`
            : `/protected/students/${studentId}/fee-pdf`;
        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`Could not generate the fee PDF (HTTP ${response.status}).`);
        }
        const blob = await response.blob();
        const fileName =
          scope === "family"
            ? "family-fee-statement.pdf"
            : `fee-statement-${studentName.replace(/\s+/g, "-")}.pdf`;
        if (!signal.aborted) {
          setPdf({ blob, fileName });
        }
      } catch (error) {
        if ((error as Error)?.name === "AbortError") return;
        setPrepareError(error instanceof Error ? error.message : "Could not generate the fee PDF.");
      } finally {
        if (!signal.aborted) setPreparing(false);
      }
    },
    [scope, familyGroupId, studentId, studentName],
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchPdf(controller.signal);
    return () => controller.abort();
  }, [open, fetchPdf]);

  function close() {
    setOpen(false);
    setUseFallback(false);
  }

  function openWhatsApp(phone: string) {
    const href = waLink(phone, shareText);
    if (href) window.open(href, "_blank", "noreferrer");
  }

  // Called directly from the click handler — no awaits before navigator.share,
  // so the user activation is still valid.
  function handleShare() {
    if (!pdf) return;
    const file = new File([pdf.blob], pdf.fileName, { type: "application/pdf" });
    const shareData: ShareData = { files: [file], title: "Fee statement", text: shareText };

    const canShareFiles =
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function" &&
      (navigator.canShare ? navigator.canShare(shareData) : true);

    if (!canShareFiles) {
      // No native file share (most desktops) — go straight to the manual flow.
      setUseFallback(true);
      return;
    }

    navigator
      .share(shareData)
      .then(() => close())
      .catch((error: Error) => {
        if (error?.name === "AbortError") return; // user dismissed the sheet
        // Native share refused (e.g. activation lost, unsupported) — fall back
        // to download + WhatsApp so the staff member is never stuck.
        toast({
          title: "Opening manual share",
          description: "Your device blocked the direct share, so download the PDF and attach it in WhatsApp.",
        });
        setUseFallback(true);
      });
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
                  onClick={() => {
                    setScope("student");
                    setUseFallback(false);
                  }}
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
                  onClick={() => {
                    setScope("family");
                    setUseFallback(false);
                  }}
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

          {prepareError ? (
            <div className="rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground">
              {prepareError}
            </div>
          ) : null}

          {useFallback && pdf ? (
            <div className="space-y-2 rounded-lg border border-border bg-surface-2 px-3 py-3">
              <p className="text-xs text-muted-foreground">
                Download the PDF, then open WhatsApp and attach it to the chat.
              </p>
              <button
                type="button"
                onClick={() => triggerDownload(pdf.blob, pdf.fileName)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Download className="size-4" aria-hidden="true" /> Download PDF
              </button>
              {phoneEntries.length > 0 ? (
                <div>
                  <PhoneActionMenu
                    entries={phoneEntries}
                    menuLabel="Open WhatsApp for"
                    onSelect={(phone) => openWhatsApp(phone)}
                  >
                    <Button type="button" size="sm" variant="outline" className="gap-1.5">
                      <MessageCircle className="size-4" aria-hidden="true" /> Open WhatsApp
                    </Button>
                  </PhoneActionMenu>
                </div>
              ) : null}
            </div>
          ) : (
            <Button
              type="button"
              className="w-full gap-2"
              onClick={handleShare}
              disabled={preparing || !pdf}
            >
              {preparing ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Preparing PDF…
                </>
              ) : (
                <>
                  <Share2 className="size-4" aria-hidden="true" /> Share PDF
                </>
              )}
            </Button>
          )}

          {!useFallback && pdf ? (
            <button
              type="button"
              onClick={() => triggerDownload(pdf.blob, pdf.fileName)}
              className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <Download className="size-3.5" aria-hidden="true" /> or download the PDF
            </button>
          ) : null}
        </div>
      </Sheet>
    </section>
  );
}
