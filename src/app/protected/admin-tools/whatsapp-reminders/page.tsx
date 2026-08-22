import { redirect } from "next/navigation";

/**
 * WhatsApp reminders moved out to its own top-level section on 22 Aug 2026.
 *
 * The path stays alive because route URLs are staff-facing contracts here — this
 * one is in browser histories, in bookmarks, and in the Admin Tools hub anyone
 * has open in another tab.
 *
 * Query-preserving, and `append` rather than `set`: the reminders screen builds
 * long query strings (`situation`, `language`, `installments=1,2`, `lastDate`,
 * `lateFeeAmount`, `lateFeeBasis`, `classId`), and dropping any one of them on
 * the way through would land the office on a different audience than the link
 * they followed described.
 */

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function WhatsappRemindersAliasPage({ searchParams }: Props) {
  const resolved = searchParams ? await searchParams : undefined;
  const params = new URLSearchParams();
  if (resolved) {
    for (const [key, value] of Object.entries(resolved)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, item);
      } else {
        params.append(key, value);
      }
    }
  }
  const query = params.toString();
  redirect(query ? `/protected/reminders?${query}` : "/protected/reminders");
}
