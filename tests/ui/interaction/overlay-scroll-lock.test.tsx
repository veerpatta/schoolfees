import { afterEach, describe, expect, it } from "vitest";

import {
  acquireSheetScrollLock,
  releaseAllSheetScrollLocks,
  releaseSheetScrollLock,
} from "@/ui/primitives/sheet";

/**
 * Freezing the page behind an overlay, on the element that actually scrolls.
 *
 * Below 767px the scroller is `<main class="mobile-app-main">`
 * (`height:100dvh; overflow-y:auto`) and the document does not scroll at all.
 * The lock used to write only `body` and `html`, so on every phone — the only
 * place these overlays exist — it did nothing.
 *
 * The scrollTop capture is the subtle half: setting `overflow:hidden` on a
 * scrolled element can reset it to 0, and `ScrollRestoringMain` persists that
 * value on unmount, so a lock that loses it silently breaks scroll restoration
 * on every screen that opens a sheet.
 */

function mountPhoneScroller(scrollTop: number) {
  const main = document.createElement("main");
  main.className = "mobile-app-main";
  document.body.appendChild(main);
  // jsdom has no layout, so scrollTop does not stick on its own.
  let value = scrollTop;
  Object.defineProperty(main, "scrollTop", {
    configurable: true,
    get: () => value,
    set: (next: number) => {
      value = next;
    },
  });
  return main;
}

afterEach(() => {
  releaseAllSheetScrollLocks();
  document.querySelectorAll(".mobile-app-main").forEach((node) => node.remove());
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

describe("overlay scroll lock", () => {
  it("locks the phone scroller, not just the document", () => {
    const main = mountPhoneScroller(240);

    acquireSheetScrollLock();

    expect(main.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.documentElement.style.overflow).toBe("hidden");
  });

  it("restores the phone scroller's position after the overlay closes", () => {
    const main = mountPhoneScroller(240);

    acquireSheetScrollLock();
    // What a real browser can do when overflow flips to hidden.
    main.scrollTop = 0;
    releaseSheetScrollLock();

    expect(main.scrollTop).toBe(240);
    expect(main.style.overflow).toBe("");
  });

  it("stays locked until the LAST overlay releases", () => {
    const main = mountPhoneScroller(120);

    acquireSheetScrollLock();
    acquireSheetScrollLock();
    releaseSheetScrollLock();

    // A nested sheet closing must not unfreeze the page under the one still
    // open — this is why the count exists and why raw body writes elsewhere
    // (which bypassed it) could strand the page unscrollable.
    expect(main.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    releaseSheetScrollLock();
    expect(main.style.overflow).toBe("");
    expect(main.scrollTop).toBe(120);
  });

  it("does not restore twice after a forced release", () => {
    const main = mountPhoneScroller(180);

    acquireSheetScrollLock();
    // The session pill force-releases every lock when switching years. The
    // open sheet's own cleanup then runs on an already-zero count; without a
    // guard that second restore replays a captured position of 0 and yanks
    // the page to the top.
    releaseAllSheetScrollLocks();
    expect(main.scrollTop).toBe(180);

    main.scrollTop = 90;
    releaseSheetScrollLock();
    expect(main.scrollTop).toBe(90);
  });

  it("is a no-op on desktop, where the document is the scroller", () => {
    acquireSheetScrollLock();
    expect(document.body.style.overflow).toBe("hidden");
    releaseSheetScrollLock();
    expect(document.body.style.overflow).toBe("");
  });
});
