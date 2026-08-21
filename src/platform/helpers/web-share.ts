/**
 * Choosing what `navigator.share` will actually accept.
 *
 * Pulled out as a pure function on purpose: the interesting behaviour is a
 * three-step probe against a browser API that jsdom does not implement, and it
 * is the part most likely to need changing once real phones report back. As a
 * function taking `canShare` it can be exercised without a DOM.
 *
 * Why probe at all. `navigator.canShare(data)` answers one boolean for the
 * WHOLE ShareData — it never says which file was refused. Chrome checks every
 * entry's MIME against its shareable-type allowlist plus aggregate size and
 * count caps; WebKit applies its own rules. So a `false` on a two-file share
 * tells you nothing except "not like that", and the only way to learn the truth
 * is to ask again with less.
 *
 * The order of `files` is the degradation order, and it matters. For a receipt
 * the caller passes [card.png, receipt.pdf] so that every fallback lands on the
 * image: a PNG renders inline in the WhatsApp chat, a PDF arrives as a grey
 * file card the parent has to open. The image is also the artefact a role
 * holding only `receipts:view` is allowed to produce.
 */

export type ShareStrategy =
  | { mode: "files"; files: File[]; includeText: boolean }
  | { mode: "unsupported" };

type CanShare = (data: ShareData) => boolean;

export type SelectShareStrategyInput = {
  /** Degradation order: index 0 is the one worth sending alone. */
  files: File[];
  text: string;
  title: string;
  /** `navigator.canShare` when present. Absent means no file sharing at all. */
  canShare: CanShare | null;
};

/**
 * Returns the richest share this browser claims it will accept.
 *
 * `includeText: false` is not a cosmetic downgrade. WhatsApp on Android ignores
 * the text of a multi-file (ACTION_SEND_MULTIPLE) share, and iOS Safari has
 * been reported to show only the text field and drop the files when both are
 * present. Either way the caller must put the message on the clipboard so the
 * staff member can paste it — two silent attachments and no words is a bad
 * message to send a parent about money.
 */
export function selectShareStrategy({
  files,
  text,
  title,
  canShare,
}: SelectShareStrategyInput): ShareStrategy {
  if (files.length === 0 || typeof canShare !== "function") {
    return { mode: "unsupported" };
  }

  const attempts: { files: File[]; includeText: boolean }[] = [];

  // Everything, with the message riding along. The Android happy path.
  attempts.push({ files, includeText: true });
  // Everything, without the message — some targets refuse the combination
  // rather than the files.
  if (files.length > 1) {
    attempts.push({ files, includeText: false });
  }
  // One file. Index 0 by contract: the caller ordered these.
  if (files.length > 1) {
    attempts.push({ files: [files[0]], includeText: true });
    attempts.push({ files: [files[0]], includeText: false });
  }

  for (const attempt of attempts) {
    const data: ShareData = attempt.includeText
      ? { files: attempt.files, title, text }
      : { files: attempt.files, title };
    let accepted = false;
    try {
      accepted = canShare(data);
    } catch {
      // A throwing canShare (seen on older WebViews) is a "no", not a crash.
      accepted = false;
    }
    if (accepted) {
      return { mode: "files", files: attempt.files, includeText: attempt.includeText };
    }
  }

  return { mode: "unsupported" };
}

/** Build the ShareData for a chosen strategy. Kept beside the chooser so the
 *  `includeText` decision cannot be re-derived differently at the call site. */
export function toShareData(
  strategy: Extract<ShareStrategy, { mode: "files" }>,
  { title, text }: { title: string; text: string },
): ShareData {
  return strategy.includeText
    ? { files: strategy.files, title, text }
    : { files: strategy.files, title };
}
