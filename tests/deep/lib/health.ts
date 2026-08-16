import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

/**
 * What a rendered page can tell us without clicking anything.
 *
 * One `page.evaluate` per route rather than a dozen locator round-trips: on a
 * sweep of 43 routes across 3 devices the difference is minutes, and every
 * value here is a plain DOM read.
 */

export type PageHealth = {
  title: string;
  bodyText: string;
  interactiveCount: number;
  brokenImages: number;
  buttonsWithoutNames: number;
  horizontalOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  hasFrameworkOverlay: boolean;
  /** The session label the SERVER resolved, read out of the chrome. */
  resolvedSessionLabel: string | null;
  isTestSessionChrome: boolean;
};

export const EMPTY_HEALTH: PageHealth = {
  title: "",
  bodyText: "",
  interactiveCount: 0,
  brokenImages: 0,
  buttonsWithoutNames: 0,
  horizontalOverflow: false,
  scrollWidth: 0,
  clientWidth: 0,
  hasFrameworkOverlay: false,
  resolvedSessionLabel: null,
  isTestSessionChrome: false,
};

export async function collectPageHealth(page: Page): Promise<PageHealth> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const bodyText = document.body?.innerText ?? "";

    const interactive = Array.from(
      document.querySelectorAll(
        'a[href],button,input,select,textarea,summary,[role="button"],[role="tab"],[role="option"]',
      ),
    ).filter((element) => {
      const rect = (element as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(element as HTMLElement);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    });

    const brokenImages = Array.from(document.images).filter(
      (img) => !img.complete || img.naturalWidth === 0,
    );

    const buttonsWithoutNames = Array.from(document.querySelectorAll("button")).filter(
      (button) => {
        const label =
          button.getAttribute("aria-label") ||
          button.getAttribute("title") ||
          button.textContent?.trim() ||
          "";
        const rect = button.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !label;
      },
    );

    // `components/admin/session-pill.tsx` stamps `vppsTestSession` on the body
    // for a test session. It is the one hook that is stable across the desktop
    // pill and the mobile one, and it is set from the label actually on screen.
    //
    // Note what this is NOT: the pill renders `optimisticLabel ?? urlSession ??
    // currentLabel`, so it follows the query string, while the layout chrome
    // resolves from the COOKIE ONLY. The two can disagree. Writes therefore
    // check the cookie separately (see lib/writes.ts) and never treat this
    // label as proof on its own.
    const labelMatch = bodyText.match(/(?:TEST|UAT|DEMO)-20\d{2}-\d{2}/);

    return {
      title: document.title,
      bodyText: bodyText.slice(0, 1500),
      interactiveCount: interactive.length,
      brokenImages: brokenImages.length,
      buttonsWithoutNames: buttonsWithoutNames.length,
      horizontalOverflow: root.scrollWidth > root.clientWidth + 2,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      hasFrameworkOverlay:
        bodyText.includes("Unhandled Runtime Error") ||
        bodyText.includes("Application error") ||
        bodyText.includes("Hydration failed"),
      resolvedSessionLabel: labelMatch ? labelMatch[0] : null,
      isTestSessionChrome: document.body?.dataset?.vppsTestSession === "true",
    };
  });
}

export type AxeViolation = {
  id: string;
  impact: string;
  help: string;
  nodes: number;
  target: string;
};

/** Serious and critical only — the two that describe a blocked user. */
export async function collectAxeViolations(page: Page): Promise<AxeViolation[]> {
  try {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact ?? "serious",
        help: violation.help,
        nodes: violation.nodes.length,
        target: String(violation.nodes[0]?.target?.[0] ?? ""),
      }));
  } catch {
    return [];
  }
}

/** Whether one Tab from the top produces a visible focus ring. */
export async function hasVisibleFocus(page: Page): Promise<boolean> {
  await page.keyboard.press("Tab").catch(() => null);
  return page
    .evaluate(() => {
      const active = document.activeElement;
      if (!active || active === document.body) return false;
      return active.matches(":focus-visible");
    })
    .catch(() => false);
}
