"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { AlertTriangle, Download, Loader2, MessageCircle, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toast";
import type { PhoneEntry } from "@/components/students/phone-entries";
import { selectShareStrategy, toShareData } from "@/lib/helpers/web-share";
import { buildWaMeLink } from "@/lib/whatsapp-templates/render";
import { cn } from "@/lib/utils";

/**
 * One sheet for "send this document to the parent on WhatsApp".
 *
 * Generalised out of `components/students/share-fee-whatsapp.tsx`, which proved
 * the mechanism for a single fee-statement PDF. Everything hard-won there is
 * kept: the files are fetched when the sheet OPENS rather than when the button
 * is pressed, because fetching inside the click consumes the transient user
 * activation that mobile browsers (iOS Safari especially) require, and the
 * share is then rejected with "could not share".
 *
 * This component owns no domain knowledge — no receipts, no students, no money
 * formatting. Callers hand it fully-built scopes with fully-rendered message
 * text. That keeps the money-formatting audit (`npm run quality:budgets`) out
 * of here and stops two callers from formatting the same amount differently.
 */

/**
 * Radix's dropdown, loaded only if the fallback path is reached. Imported
 * eagerly it joined the chunk every protected route shares, for a menu most
 * sends never show.
 */
const PhoneActionMenu = dynamic(
  () =>
    import("@/components/students/phone-chooser").then((mod) => mod.PhoneActionMenu),
  { ssr: false },
);

export type ShareDocSpec = {
  id: string;
  /** Same-origin, staff-authed document route. */
  url: string;
  fileName: string;
  mimeType: "image/png" | "application/pdf";
  /** Translated, e.g. "Receipt card (image)". Shown in the contents row. */
  label: string;
};

export type ShareScope = {
  id: string;
  /** Already translated. */
  label: string;
  /**
   * Ordered, and the order is the degradation order — docs[0] is what gets
   * sent if the browser refuses the full set. See lib/helpers/web-share.ts.
   */
  docs: ShareDocSpec[];
  /** Fully rendered and ready to send. */
  message: string;
  shareTitle: string;
  /** When set, the send button stays disabled until the caution is accepted. */
  caution?: { title: string; body: string; ackLabel: string } | null;
};

export type DocumentShareSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 1..3. The picker hides itself when there is only one. */
  scopes: ShareScope[];
  initialScopeId?: string;
  phones: PhoneEntry[];
};

type PreparedDoc = { spec: ShareDocSpec; file: File };

function triggerDownload(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the download a tick to start before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function DocumentShareSheet({
  open,
  onOpenChange,
  title,
  scopes,
  initialScopeId,
  phones,
}: DocumentShareSheetProps) {
  const t = useTranslations("MobileApp");
  const [activeScopeId, setActiveScopeId] = useState(
    initialScopeId ?? scopes[0]?.id ?? "",
  );
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedDoc[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [acked, setAcked] = useState(false);
  // Set once a native share is impossible or refused, so staff can still
  // download the files and open WhatsApp on a chosen number.
  const [useFallback, setUseFallback] = useState(false);

  const scope = scopes.find((entry) => entry.id === activeScopeId) ?? scopes[0];

  const fetchDocs = useCallback(
    async (docs: ShareDocSpec[], signal: AbortSignal) => {
      setPreparing(true);
      setErrors([]);
      setPrepared([]);

      const settled = await Promise.allSettled(
        docs.map(async (spec) => {
          const response = await fetch(spec.url, { signal });
          if (!response.ok) {
            throw new Error(
              t("shareDocErrorStatus", { name: spec.label, status: response.status }),
            );
          }
          const blob = await response.blob();
          return {
            spec,
            file: new File([blob], spec.fileName, { type: spec.mimeType }),
          } satisfies PreparedDoc;
        }),
      );

      if (signal.aborted) return;

      // One document failing does not sink the send. A role that may view a
      // receipt but not print it is filtered upstream, so a 403 here means the
      // permission changed since the page rendered — drop that document and
      // send what is still allowed rather than showing the staff member a dead
      // sheet at the counter.
      const ok: PreparedDoc[] = [];
      const failed: string[] = [];
      for (const result of settled) {
        if (result.status === "fulfilled") ok.push(result.value);
        else if ((result.reason as Error)?.name !== "AbortError") {
          failed.push(
            result.reason instanceof Error ? result.reason.message : String(result.reason),
          );
        }
      }

      setPrepared(ok);
      setErrors(failed);
      setPreparing(false);
    },
    [t],
  );

  useEffect(() => {
    if (!open || !scope) return;
    const controller = new AbortController();
    void fetchDocs(scope.docs, controller.signal);
    return () => controller.abort();
  }, [open, scope, fetchDocs]);

  function close() {
    onOpenChange(false);
    setUseFallback(false);
    setAcked(false);
  }

  function switchScope(nextId: string) {
    setActiveScopeId(nextId);
    setUseFallback(false);
    setAcked(false);
  }

  function openWhatsApp(phone: string) {
    if (!scope) return;
    window.open(buildWaMeLink(phone, scope.message), "_blank", "noreferrer");
  }

  /**
   * Runs straight off the click — no awaits before `navigator.share`, or the
   * user activation is gone and the share is refused.
   */
  function handleShare() {
    if (!scope || prepared.length === 0) return;

    const files = prepared.map((entry) => entry.file);
    const strategy = selectShareStrategy({
      files,
      text: scope.message,
      title: scope.shareTitle,
      canShare:
        typeof navigator !== "undefined" && typeof navigator.share === "function"
          ? (navigator.canShare?.bind(navigator) ?? (() => true))
          : null,
    });

    if (strategy.mode === "unsupported") {
      // Most desktops, and any browser without file sharing.
      setUseFallback(true);
      return;
    }

    // Copy the message regardless of whether it is riding along. WhatsApp drops
    // the text of a multi-file share on Android, and this is the difference
    // between the parent getting a receipt with an explanation and getting two
    // silent attachments. Fired off the same gesture, before share().
    void navigator.clipboard?.writeText(scope.message).catch(() => {});

    if (!strategy.includeText || strategy.files.length < files.length) {
      const droppedDoc = prepared.find(
        (entry) => !strategy.files.includes(entry.file),
      );
      toast({
        title: t("shareCaptionCopiedTitle"),
        description: droppedDoc
          ? t("shareSingleFileNotice", { doc: strategy.files[0]?.name ?? "" })
          : t("shareCaptionCopiedHint"),
      });
    }

    navigator
      .share(toShareData(strategy, { title: scope.shareTitle, text: scope.message }))
      .then(() => close())
      .catch((error: Error) => {
        if (error?.name === "AbortError") return; // staff dismissed the sheet
        toast({
          title: t("shareManualToastTitle"),
          description: t("shareManualToastBody"),
        });
        setUseFallback(true);
      });
  }

  if (!scope) return null;

  const sendBlocked = Boolean(scope.caution) && !acked;
  const nothingPrepared = !preparing && prepared.length === 0;

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      size="md"
      historyDismiss
      footer={
        useFallback ? undefined : (
          <Button
            type="button"
            className="w-full gap-2"
            onClick={handleShare}
            disabled={preparing || prepared.length === 0 || sendBlocked}
          >
            {preparing ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {t("sharePreparingFiles")}
              </>
            ) : (
              <>
                <Share2 className="size-4" aria-hidden="true" />
                {t("shareCtaFiles")}
              </>
            )}
          </Button>
        )
      }
    >
      <div className="space-y-4 pt-1">
        {/* A caution is never advisory here. This sheet is one tap from a
            parent's phone, with nothing between the warning and the send — so
            the warning has to be acknowledged rather than merely displayed. */}
        {scope.caution ? (
          <div
            role="alert"
            className="rounded-lg bg-destructive-soft px-3 py-3 text-xs text-destructive-soft-foreground"
          >
            <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
              {scope.caution.title}
            </p>
            <p className="mt-1 leading-5">{scope.caution.body}</p>
            <button
              type="button"
              onClick={() => setAcked((value) => !value)}
              aria-pressed={acked}
              className={cn(
                "focus-ring mt-2.5 flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12.5px] font-semibold active:scale-[0.99]",
                acked
                  ? "border-destructive bg-destructive/15"
                  : "border-destructive/40 bg-transparent",
              )}
            >
              <span aria-hidden="true">{acked ? "☑" : "☐"}</span>
              {scope.caution.ackLabel}
            </button>
          </div>
        ) : null}

        {scopes.length > 1 ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("shareScopeLabel")}</p>
            <div
              className={cn(
                "mt-2 grid gap-2",
                scopes.length >= 3 ? "grid-cols-3" : "grid-cols-2",
              )}
            >
              {scopes.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => switchScope(entry.id)}
                  className={cn(
                    "focus-ring rounded-lg border px-3 py-2 text-left text-sm",
                    entry.id === scope.id
                      ? "border-accent bg-accent-soft/40 font-semibold"
                      : "border-border hover:bg-surface-2",
                  )}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* What the parent actually receives. Staff without `receipts:print`
            simply see one row instead of two — the sheet says nothing about
            permissions, because what matters at the counter is what lands in
            the chat, not which rights the sender holds. */}
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
          <p className="font-medium text-muted-foreground">{t("shareDocsLabel")}</p>
          <ul className="mt-1 space-y-0.5">
            {scope.docs.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-2">
                <span className="text-foreground">{doc.label}</span>
                {preparing ? (
                  <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
                ) : prepared.some((entry) => entry.spec.id === doc.id) ? (
                  <span className="shrink-0 text-success" aria-hidden="true">✓</span>
                ) : (
                  <span className="shrink-0 text-muted-foreground" aria-hidden="true">—</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {phones.length > 0 ? (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs">
            <p className="font-medium text-muted-foreground">{t("shareNumbersOnFile")}</p>
            <ul className="mt-1 space-y-0.5">
              {phones.map((entry) => (
                <li key={entry.phone} className="flex items-center justify-between">
                  <span className="text-foreground">{entry.label}</span>
                  <span className="font-mono text-muted-foreground">{entry.phone}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-muted-foreground">{t("shareNumbersHint")}</p>
          </div>
        ) : (
          <div className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
            {t("shareNoNumber")}
          </div>
        )}

        {errors.length > 0 ? (
          <div className="rounded-lg bg-destructive-soft px-3 py-2 text-xs text-destructive-soft-foreground">
            {errors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        ) : null}

        {nothingPrepared ? (
          <div className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-soft-foreground">
            {t("shareNothingToSend")}
          </div>
        ) : null}

        <p className="text-[11px] leading-4 text-muted-foreground">
          {t("shareCaptionCopiedHint")}
        </p>

        {useFallback ? (
          <div className="space-y-2 rounded-lg border border-border bg-surface-2 px-3 py-3">
            <p className="text-xs text-muted-foreground">{t("shareFallbackHint")}</p>
            {prepared.map((entry) => (
              <button
                key={entry.spec.id}
                type="button"
                onClick={() => triggerDownload(entry.file)}
                className="focus-ring flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                <Download className="size-4" aria-hidden="true" />
                {t("shareDownloadFile", { name: entry.spec.label })}
              </button>
            ))}
            {phones.length > 0 ? (
              <PhoneActionMenu
                entries={phones}
                menuLabel={t("shareOpenWhatsAppFor")}
                onSelect={(phone) => openWhatsApp(phone)}
              >
                <Button type="button" size="sm" variant="outline" className="gap-1.5">
                  <MessageCircle className="size-4" aria-hidden="true" />
                  {t("shareOpenWhatsApp")}
                </Button>
              </PhoneActionMenu>
            ) : null}
          </div>
        ) : prepared.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-3">
            {prepared.map((entry) => (
              <button
                key={entry.spec.id}
                type="button"
                onClick={() => triggerDownload(entry.file)}
                className="focus-ring flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                <Download className="size-3.5" aria-hidden="true" />
                {t("shareDownloadFile", { name: entry.spec.label })}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
