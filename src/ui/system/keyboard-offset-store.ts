/**
 * The on-screen keyboard height, as a value React components can subscribe to.
 *
 * `KeyboardOffsetProvider` publishes the same number as the `--keyboard-offset`
 * CSS variable, which is enough for layout but invisible to JavaScript — so
 * nothing could *react* to the keyboard, only be pushed by it. Anything that
 * needs to run code when the keyboard appears (scrolling a focused field back
 * into view, for one) had to guess with a `setTimeout`.
 *
 * One store, fed by the single `visualViewport` listener in the provider.
 * Do NOT add a second listener anywhere — that duplication is what
 * tests/ui/mobile-action-reachability.test.ts guards against.
 */

let keyboardOffset = 0;
const listeners = new Set<() => void>();

/**
 * How much of the layout viewport the keyboard covers.
 *
 * `offsetTop` matters: iOS both shrinks the visual viewport AND shifts it down
 * when the page is scrolled with the keyboard up. Ignoring it overstates the
 * keyboard by however far the viewport has moved, which is what made lifted
 * footers drift while scrolling.
 */
export function computeKeyboardOffset(
  innerHeight: number,
  viewportHeight: number,
  viewportOffsetTop: number,
): number {
  return Math.max(0, Math.round(innerHeight - (viewportHeight + viewportOffsetTop)));
}

export function setKeyboardOffset(next: number) {
  if (next === keyboardOffset) {
    return;
  }

  keyboardOffset = next;
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeKeyboardOffset(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getKeyboardOffset() {
  return keyboardOffset;
}

/** There is no keyboard on the server, and the snapshot must be stable. */
export function getServerKeyboardOffset() {
  return 0;
}
