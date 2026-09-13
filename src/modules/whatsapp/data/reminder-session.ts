import "server-only";

import { parseAcademicSessionLabel } from "@/platform/config/fee-rules";
import { getViewSessionCookie } from "@/platform/session/cookie";
import { resolveCurrentSessionLabel } from "@/modules/whatsapp/domain/fee-reminders";

/**
 * Which session's ledger the reminders screens are looking at.
 *
 * This exists because they were not looking at the one the staff member had
 * chosen. Every route under `/protected/reminders` resolved its session with
 * `resolveCurrentSessionLabel`, which reads `academic_sessions.is_current` —
 * the school's LIVE year, globally, for everyone. The session pill does not
 * touch that: switching sessions writes a cookie, and `resolveViewSession` is
 * how the other twenty-five screens read it.
 *
 * So an office sitting in `TEST-2026-27` opened WhatsApp reminders and was
 * shown 141 real families, with real parents' phone numbers, under a magenta
 * badge reading "TEST SESSION — not live data". The badge comes from the pill
 * and was telling the truth about the pill; the list underneath it came from
 * somewhere else. Pressing Send there would have messaged real parents from a
 * screen that said it could not.
 *
 * The cookie is trusted when it parses, exactly as `resolveViewSession` trusts
 * it, so the reminders lane and the rest of the app can never disagree about
 * which year is on screen. A cookie naming a session with no students simply
 * produces an empty list, which the `no_recipients` guard already refuses to
 * send — the safe failure, and a visible one.
 *
 * NOT for the cron. `/api/cron/whatsapp-scheduled-runs` has no cookie and no
 * staff member; a scheduled run is about the school's live year by definition,
 * and it keeps calling `resolveCurrentSessionLabel` directly.
 */
export async function resolveReminderSessionLabel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string> {
  const cookie = await getViewSessionCookie().catch(() => null);
  if (cookie) {
    try {
      return parseAcademicSessionLabel(cookie).normalizedLabel;
    } catch {
      // A hand-edited or stale cookie falls through to the live session rather
      // than throwing. Refusing to render the screen over an unreadable cookie
      // would be a worse failure than showing the year the school is actually in.
    }
  }
  return resolveCurrentSessionLabel(supabase);
}
