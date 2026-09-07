"use client";

import { useCallback, useState } from "react";
import { Check, Copy, Loader2, Share2 } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { toast } from "@/ui/primitives/toast";
import { selectShareStrategy, toShareData } from "@/platform/helpers/web-share";

/**
 * Getting one class list off the phone and into a teacher's hands.
 *
 * **Share is deliberately two presses.** The first fetches the PDF and the
 * button becomes "Send"; the second calls `navigator.share`. Fetching inside
 * the sharing click consumes the transient user activation mobile browsers —
 * iOS Safari especially — require, and the share is then rejected with "could
 * not share". `document-share-sheet.tsx` learned this the hard way and solves
 * it by fetching when its sheet opens; a bare button has no "open", so the
 * first press is the open.
 *
 * `DocumentShareSheet` itself is not reused here: it is built around sending a
 * document to a PARENT and takes a list of their numbers to choose between. A
 * teacher is picked from the operating system's own share sheet, so there is no
 * number for us to offer.
 */

type Props = {
  /** Same-origin, staff-authed PDF route for this one group. */
  pdfHref: string;
  fileName: string;
  shareTitle: string;
  /** Rendered on the server, so the clipboard and the sheet cannot disagree. */
  text: string;
};

export function CollectionListActions({ pdfHref, fileName, shareTitle, text }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [copied, setCopied] = useState(false);

  const prepare = useCallback(async () => {
    setPreparing(true);
    try {
      const response = await fetch(pdfHref);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      setFile(new File([blob], fileName, { type: "application/pdf" }));
    } catch {
      toast({
        title: "Could not prepare the list",
        description: "Try the PDF button instead — it downloads the same sheet.",
        tone: "danger",
      });
    } finally {
      setPreparing(false);
    }
  }, [pdfHref, fileName]);

  const share = useCallback(async () => {
    if (!file) return;

    const canShare =
      typeof navigator !== "undefined" && typeof navigator.canShare === "function"
        ? navigator.canShare.bind(navigator)
        : null;
    const strategy = selectShareStrategy({ files: [file], text, title: shareTitle, canShare });

    if (strategy.mode === "unsupported" || typeof navigator.share !== "function") {
      toast({
        title: "Sharing is not available on this device",
        description: "Use the PDF button and attach the file yourself.",
      });
      return;
    }

    try {
      await navigator.share(toShareData(strategy, { title: shareTitle, text }));
    } catch (error) {
      // A cancelled share is a decision, not a failure — never toast on it.
      if ((error as Error)?.name !== "AbortError") {
        toast({ title: "Could not share the list", tone: "danger" });
      }
    }
  }, [file, text, shareTitle]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Could not copy the list", tone: "danger" });
    }
  }, [text]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 md:min-h-0"
        onClick={file ? share : prepare}
        disabled={preparing}
      >
        {preparing ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Share2 className="size-3.5" aria-hidden="true" />
        )}
        {preparing ? "Preparing" : file ? "Send" : "Share"}
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11 md:min-h-0"
        onClick={copy}
      >
        {copied ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
    </>
  );
}
