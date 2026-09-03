import { Label } from "@/ui/primitives/label";
import { SelectNative } from "@/ui/primitives/select-native";

/**
 * "Hold some families back, so this run can be measured."
 *
 * A SERVER component passed into `RemindersWorkspace` as a prop. It is static
 * markup with no client state, and `/protected/reminders` sits under a gzip
 * ceiling that only ratchets down — rendering it here keeps its copy out of
 * every browser while it still submits inside the workspace's one form.
 *
 * Behind a `<details>` so it is never the thing somebody sets on the way to
 * Send, and worded so that what it costs is impossible to miss: a holdout means
 * deliberately not chasing money these families owe.
 */
export function HoldoutControl() {
  return (
    <details className="rounded-lg border border-dashed border-border bg-surface-2 px-3 py-2">
      {/* min-h-11: the summary is the tap target that opens this. */}
      <summary className="min-h-11 cursor-pointer list-none py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Hold some families back, to measure this
      </summary>
      {/* flex gap rather than space-y, so nothing leaves a band when hidden. */}
      <div className="flex flex-col gap-2 pb-2">
        <p className="text-xs text-muted-foreground">
          This run can only say who paid <em>after</em> a reminder, never because of it — payments
          are spiky and no join can tell a response apart from a batch of counter cash. Holding a
          random share back is the only way to find out.
        </p>
        <p className="text-xs font-semibold text-warning-foreground">
          It also means deliberately not chasing money these families owe. They get no message and
          no second chance in this run.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="holdoutPercent">Hold back</Label>
            <SelectNative
              id="holdoutPercent"
              name="holdoutPercent"
              defaultValue="0"
              className="w-40"
            >
              <option value="0">Nobody (default)</option>
              <option value="5">5% of the list</option>
              <option value="10">10% of the list</option>
              <option value="20">20% of the list</option>
            </SelectNative>
          </div>
          <p className="text-xs text-muted-foreground">
            Rounded down, and never everybody. The run page compares them afterwards.
          </p>
        </div>
      </div>
    </details>
  );
}
