import {
  REMINDER_QUERY_KEYS,
  reminderQuery,
  type ReminderQueryKey,
} from "@/modules/whatsapp/domain/audience";
import type { ReminderFilters } from "@/modules/whatsapp/domain/fee-reminders";

/**
 * Every query parameter the reminders screen holds, as hidden inputs, minus the
 * ones the surrounding form owns.
 *
 * One generic renderer rather than a hand-written list per form. There used to
 * be five hand-written lists — three forms on the send screen, the notice
 * picker's `hrefWith` and the collection-list links — and a key added to four
 * of the five is a key that silently resets the moment somebody presses Apply.
 * This feature has already shipped that bug once.
 *
 * A server component: it renders hidden inputs and nothing else, on a route
 * whose bundle ceiling only ratchets down.
 */
export function CarriedFilterFields({
  filters,
  except = [],
}: {
  filters: ReminderFilters;
  except?: readonly ReminderQueryKey[];
}) {
  const params = reminderQuery(filters);
  return (
    <>
      {REMINDER_QUERY_KEYS.filter((key) => !except.includes(key)).map((key) => {
        const value = params.get(key);
        if (value === null) return null;
        return <input key={key} type="hidden" name={key} value={value} />;
      })}
    </>
  );
}
