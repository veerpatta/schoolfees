import Link from "next/link";

import type { ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";
import { COLLECTION_GROUP_BY } from "@/modules/whatsapp/domain/collection-list";
import { reminderQuery } from "@/modules/whatsapp/domain/audience";

/**
 * The way off this screen and onto paper.
 *
 * A SERVER component rendering plain links, and that is not a style choice.
 * `/protected/reminders` has roughly 800 gzip bytes of headroom against its
 * ceiling in `quality/route-bundle-baseline.json`, and that file's rule is that
 * ceilings ratchet down. So this route gets no new client JavaScript: every
 * download button, the share sheet and the copy button live on
 * `/protected/reminders/lists`, which these links point at.
 *
 * Concretely: **do not name a download route in this file.** `DownloadAnchor`
 * is a client component, and `tests/ui/exports-page-links.test.tsx` fails any
 * `.tsx` that mentions a download route beside a `<Link>` unless it is
 * allowlisted. Linking to a PAGE keeps both problems away.
 */
export function CollectionListLinks({ filters }: { filters: ReminderFilters }) {
  // Every audience-shaping value, from the ONE canonical key list. Dropping one
  // silently exports a different school — this used to be a hand-written object
  // that had to be edited in step with four others.
  const carried = reminderQuery(filters);

  return (
    // On a phone the label sits on its own line and the three links form an
    // even 3-up row. Inline, "Hand this list out:" plus three pills wrapped
    // into three ragged lines at 375px and read as unrelated controls.
    <div className="flex flex-col gap-2 text-sm md:flex-row md:flex-wrap md:items-center">
      <span className="text-muted-foreground">Hand this list out:</span>
      <div className="grid grid-cols-3 gap-2 md:flex md:gap-2">
        {COLLECTION_GROUP_BY.map((option) => {
          const search = new URLSearchParams(carried);
          search.set("groupBy", option.value);
          return (
            <Link
              key={option.value}
              href={`/protected/reminders/lists?${search.toString()}`}
              className="focus-ring inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-2 text-center text-xs font-semibold text-foreground md:min-h-0 md:px-3 md:py-1.5 md:text-sm"
            >
              {option.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
