import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ToastViewport } from "@/ui/primitives/toast";
import {
  SendReminderSheet,
  type ReminderDateDefaults,
  type ReminderSendState,
} from "@/modules/students/ui/send-reminder-sheet";

vi.mock("next/navigation", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

/**
 * The one-tap fee reminder, as a staff member meets it.
 *
 * Every send from this sheet used to be refused. It posted no date, so
 * `describeDateGuard` returned "Pick a last date for this notice before
 * sending" — a BLOCKING finding — and the screen answered with tick-boxes and a
 * "why send anyway?" box that could not clear it. Staff ticked everything,
 * typed a reason, pressed Send anyway, and got the identical refusal, with
 * nothing on screen admitting that was the only possible outcome.
 *
 * These pin the three halves of the repair from the outside: the date is on the
 * form, a blocking refusal offers no override, and one family is not made to
 * type an essay.
 */

const DATES: ReminderDateDefaults = {
  lastDate: "2026-10-20",
  today: "2026-09-13",
  runDateFreeSituations: ["late_fee_applied", "promise_due"],
};

const SITUATIONS = [
  { value: "fee_due", label: "Fee due" },
  { value: "upcoming", label: "Due soon" },
  { value: "late_fee_applied", label: "Late fee applied" },
];

function renderSheet(
  action: (state: ReminderSendState, formData: FormData) => Promise<ReminderSendState>,
  studentIds: string[] = ["student-1"],
) {
  return render(
    <>
      <SendReminderSheet
        open
        onClose={() => {}}
        studentIds={studentIds}
        audienceLabel="Aarti Test Choudhary"
        situationOptions={SITUATIONS}
        defaultSituation="fee_due"
        defaultLanguage="hi"
        dates={DATES}
        action={action}
      />
      <ToastViewport />
    </>,
  );
}

describe("the one-tap reminder sheet", () => {
  it("posts the date the message will name, without anybody typing one", async () => {
    const posted: FormData[] = [];
    const action = vi.fn(async (_state: ReminderSendState, formData: FormData) => {
      posted.push(formData);
      return { status: "success", message: "1 sent", sent: 1 } as ReminderSendState;
    });

    renderSheet(action);
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(posted).toHaveLength(1));
    // The whole bug in one assertion: this used to be absent, and absent is
    // what the blocking date guard fires on.
    expect(posted[0]!.get("lastDate")).toBe("2026-10-20");
    expect(posted[0]!.get("situation")).toBe("fee_due");
  });

  it("hides the date on the two notices that print none", async () => {
    renderSheet(async () => ({ status: "idle" }) as ReminderSendState);

    expect(screen.getByLabelText(/pay by/i)).toBeTruthy();
    // `late_fee_applied` has no date slot at all — its whole subject is that a
    // date has gone — so asking for one would be asking for nothing.
    await userEvent.selectOptions(screen.getByLabelText(/^message$/i), "late_fee_applied");
    expect(screen.queryByLabelText(/pay by/i)).toBeNull();
  });

  it("will not offer a deadline that has already passed", () => {
    renderSheet(async () => ({ status: "idle" }) as ReminderSendState);
    expect(screen.getByLabelText(/pay by/i).getAttribute("min")).toBe("2026-09-13");
  });

  it("offers no override when the refusal is one no override can clear", async () => {
    // A blocking refusal comes back with no `guards`, so the sheet shows the
    // plain reason instead of an argument it cannot win.
    const action = vi.fn(
      async () =>
        ({
          status: "error",
          message: "AISENSY_API_KEY is not configured on the server.",
        }) as ReminderSendState,
    );

    renderSheet(action);
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("AISENSY_API_KEY"));
    expect(screen.queryByLabelText(/why send anyway/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /send anyway/i })).toBeNull();
  });

  it("lets one family through on a second press, with nothing to type", async () => {
    let call = 0;
    const posted: FormData[] = [];
    const action = vi.fn(async (_state: ReminderSendState, formData: FormData) => {
      call += 1;
      if (call === 1) {
        return {
          status: "error",
          message: "It is 23:00.",
          guards: [{ code: "quiet_hours", message: "It is 23:00." }],
        } as ReminderSendState;
      }
      posted.push(formData);
      return { status: "success", message: "1 sent", sent: 1 } as ReminderSendState;
    });

    renderSheet(action);
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    // The warning is shown and pre-agreed; only the typing is spared.
    const sendAnyway = await screen.findByRole("button", { name: /send anyway/i });
    expect((sendAnyway as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByLabelText(/why send anyway/i).getAttribute("required")).toBeNull();

    await userEvent.click(sendAnyway);
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]!.getAll("overrideGuard")).toContain("quiet_hours");
  });

  it("still makes a bulk send say why, in somebody's own words", async () => {
    const action = vi.fn(
      async () =>
        ({
          status: "error",
          message: "It is 23:00.",
          guards: [{ code: "quiet_hours", message: "It is 23:00." }],
        }) as ReminderSendState,
    );

    renderSheet(action, ["student-1", "student-2", "student-3"]);
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));

    const sendAnyway = await screen.findByRole("button", { name: /send anyway/i });
    expect((sendAnyway as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/why send anyway/i), "Owner asked for it.");
    expect((sendAnyway as HTMLButtonElement).disabled).toBe(false);
  });
});
