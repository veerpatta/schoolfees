import type { Page } from "@playwright/test";

/**
 * Clicking around a live financial app without posting anything.
 *
 * The allowlist is the safety mechanism and it is deliberately positive: a
 * control is clicked only when its label matches SAFE **and** does not match
 * UNSAFE. An unlabelled control is skipped. That ordering matters — a
 * deny-list alone would click a button called "Confirm" the day someone adds
 * one, and this suite runs against a session that shares a deployment with the
 * live ledger.
 */

/** Anything that could move money, create a record, or leave the page dirty. */
export const UNSAFE_LABEL =
  /delete|remove|save|create|add student|commit|publish|promot|refund|day close|close due|adjust|correct|reconcile|post|collect|pay now|approve|import valid|upload file|run promotion|apply|waive|undo|reverse|send|whatsapp|generate|prepare|switch|sign out|log ?out/i;

/** Read-only affordances worth exercising. */
export const SAFE_LABEL =
  /search|filter|clear|show|hide|view|print|copy|refresh|expand|collapse|download|back|cancel|more details|previous uploads|history|details|close/i;

export const SEARCH_INPUT_SELECTOR =
  'input[type="search"], input[name*="query" i], input[name*="search" i], input[placeholder*="search" i], input[placeholder*="Name or SR" i]';

/**
 * A string chosen to break naive query handling: a Unicode apostrophe that
 * looks like a SQL quote, an emoji outside the BMP, and RTL Arabic. It has
 * found encoding bugs before; it must never find rows.
 */
export const HOSTILE_QUERY = "ZZZZZZ O'Brien 😀 اختبار";

export type InteractionResult = {
  clicked: number;
  searched: number;
  labels: string[];
};

export async function exerciseSafeInteractions(
  page: Page,
  options: { maxPerSelector?: number } = {},
): Promise<InteractionResult> {
  const maxPerSelector = options.maxPerSelector ?? 10;
  const result: InteractionResult = { clicked: 0, searched: 0, labels: [] };

  for (const selector of ["summary", '[role="tab"]', "button", "a[href]"]) {
    const locators = page.locator(selector);
    const total = Math.min(await locators.count().catch(() => 0), maxPerSelector);

    for (let index = 0; index < total; index += 1) {
      const item = locators.nth(index);
      if (!(await item.isVisible().catch(() => false))) continue;

      const text = (
        (await item.innerText().catch(() => "")) ||
        (await item.getAttribute("aria-label").catch(() => "")) ||
        ""
      ).trim();

      if (!text || UNSAFE_LABEL.test(text) || !SAFE_LABEL.test(text)) continue;

      try {
        await item.hover({ timeout: 1500 });
        await item.click({ timeout: 2500 });
        await page.waitForTimeout(250);
        result.clicked += 1;
        result.labels.push(text.slice(0, 60));
        if (/back/i.test(text)) {
          await page.goBack({ waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => null);
        }
      } catch {
        // A control that refuses to be clicked is not itself a finding; the
        // page-level health checks carry the signal.
      }
    }
  }

  const searchInputs = page.locator(SEARCH_INPUT_SELECTOR);
  const totalInputs = Math.min(await searchInputs.count().catch(() => 0), 3);

  for (let index = 0; index < totalInputs; index += 1) {
    const input = searchInputs.nth(index);
    if (!(await input.isVisible().catch(() => false))) continue;
    try {
      await input.fill(HOSTILE_QUERY);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      await input.fill("");
      result.searched += 1;
    } catch {
      // Non-fatal exploratory interaction.
    }
  }

  for (let index = 0; index < 10; index += 1) {
    await page.keyboard.press("Tab").catch(() => null);
  }
  await page.keyboard.press("Escape").catch(() => null);

  return result;
}
