import { describe, expect, it, vi } from "vitest";

import { selectShareStrategy, toShareData } from "@/lib/helpers/web-share";

/**
 * The degradation ladder behind the one-tap WhatsApp send.
 *
 * This is the part of the feature that depends on a third-party app's
 * behaviour — WhatsApp's handling of a multi-file share differs by platform and
 * by version — so the rungs are pinned here rather than discovered on a staff
 * member's phone at the counter.
 */

function file(name: string, type: string): File {
  return new File(["x"], name, { type });
}

const png = file("receipt-SVP-1.png", "image/png");
const pdf = file("receipt-SVP-1.pdf", "application/pdf");
const args = { text: "message body", title: "Receipt SVP-1" };

describe("selectShareStrategy", () => {
  it("sends both files with the message when the browser accepts it", () => {
    const canShare = vi.fn().mockReturnValue(true);

    const strategy = selectShareStrategy({ files: [png, pdf], canShare, ...args });

    expect(strategy).toEqual({ mode: "files", files: [png, pdf], includeText: true });
    expect(canShare).toHaveBeenCalledTimes(1);
  });

  it("drops the text rather than the files when the pair-with-text is refused", () => {
    // The iOS/WhatsApp shape: files are fine, files+text is not.
    const canShare = vi.fn((data: ShareData) => !("text" in data && data.text));

    const strategy = selectShareStrategy({ files: [png, pdf], canShare, ...args });

    expect(strategy).toEqual({ mode: "files", files: [png, pdf], includeText: false });
  });

  it("falls back to the FIRST file, which callers order as the image", () => {
    // The image renders inline in the chat; the PDF arrives as a file to open.
    // Losing the image and keeping the PDF would be the wrong single file.
    const canShare = vi.fn((data: ShareData) => (data.files ?? []).length === 1);

    const strategy = selectShareStrategy({ files: [png, pdf], canShare, ...args });

    expect(strategy).toMatchObject({ mode: "files", files: [png] });
    expect((strategy as { files: File[] }).files[0].type).toBe("image/png");
  });

  it("reports unsupported when nothing is accepted", () => {
    const strategy = selectShareStrategy({
      files: [png, pdf],
      canShare: () => false,
      ...args,
    });

    expect(strategy).toEqual({ mode: "unsupported" });
  });

  it("reports unsupported when the browser has no canShare at all", () => {
    expect(selectShareStrategy({ files: [png], canShare: null, ...args })).toEqual({
      mode: "unsupported",
    });
  });

  it("reports unsupported when no document could be prepared", () => {
    // Every fetch failed — a 403 on the PDF plus a network error on the card.
    expect(
      selectShareStrategy({ files: [], canShare: () => true, ...args }),
    ).toEqual({ mode: "unsupported" });
  });

  it("treats a throwing canShare as a refusal, not a crash", () => {
    const canShare = vi.fn(() => {
      throw new Error("not implemented");
    });

    expect(selectShareStrategy({ files: [png], canShare, ...args })).toEqual({
      mode: "unsupported",
    });
  });

  it("never asks for a single file when there was only ever one", () => {
    const canShare = vi.fn().mockReturnValue(false);

    selectShareStrategy({ files: [png], canShare, ...args });

    // One probe: the single file with text. No pointless repeats.
    expect(canShare).toHaveBeenCalledTimes(1);
  });
});

describe("toShareData", () => {
  it("omits text when the chosen strategy dropped it", () => {
    const data = toShareData({ mode: "files", files: [png], includeText: false }, args);

    expect(data.text).toBeUndefined();
    expect(data.files).toEqual([png]);
    expect(data.title).toBe(args.title);
  });

  it("carries text when the strategy kept it", () => {
    const data = toShareData({ mode: "files", files: [png], includeText: true }, args);

    expect(data.text).toBe("message body");
  });
});
