import { StrictMode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudentAvatarButton } from "@/components/students/student-photo-viewer";

/**
 * What this file covers, and what it deliberately does not.
 *
 * It covers the tap contract: the photo opens, tapping it does NOT also open
 * the student (the list rows navigate on row click, so the avatar has to stop
 * that), the child's name and SR are shown, Escape closes, and a student with
 * no photo gets a plain avatar rather than a control that opens an empty box.
 *
 * It does NOT cover the bug that actually broke this component first. The
 * viewer used to open and close itself in the same frame: its history-dismiss
 * effect was keyed on mount rather than on `open`, so StrictMode's mount /
 * unmount / remount ran the teardown's `history.back()` after the second mount
 * had pushed its own entry, and the remounted listener read that
 * self-inflicted popstate as a real back gesture.
 *
 * That is unreachable from here. jsdom does not deliver popstate from
 * `history.back()` the way a browser does, so this suite passes just as
 * happily against the broken implementation — verified by reintroducing the
 * bug and watching all five tests stay green. A test that cannot fail on the
 * defect it names is worse than no test, so the guard lives in
 * tests/deep/specs/09-interaction-gates.spec.ts, where it runs in Chrome
 * against a real history stack. The StrictMode wrapper stays because it is
 * free and closer to how the app renders.
 */

const messages = { Common: { close: "Close" } };

function renderViewer({ onRowClick }: { onRowClick?: () => void } = {}) {
  return render(
    <StrictMode>
      <NextIntlClientProvider locale="en" messages={messages}>
        {/* Mirrors the list row: a clickable ancestor that opens the student. */}
        <div
          onClick={(event) => {
            const target = event.target as HTMLElement | null;
            if (target && target.closest('[data-row-action="true"]')) return;
            onRowClick?.();
          }}
        >
          <StudentAvatarButton
            photoPath="student-1/photo.jpg"
            fullName="AANSH KUMAWAT"
            admissionNo="2665"
          />
        </div>
      </NextIntlClientProvider>
    </StrictMode>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  // The viewer asks for a signed URL on open; the network is not the subject.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ url: "blob:photo" }) })),
  );
});

describe("student photo viewer", () => {
  it("opens on the avatar", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.click(screen.getByRole("button", { name: "AANSH KUMAWAT photo" }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("does not open the student when the photo is tapped", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    renderViewer({ onRowClick });

    await user.click(screen.getByRole("button", { name: "AANSH KUMAWAT photo" }));

    await screen.findByRole("dialog");
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("shows the child's name and SR beside the photo", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.click(screen.getByRole("button", { name: "AANSH KUMAWAT photo" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("AANSH KUMAWAT");
    expect(dialog).toHaveTextContent("SR 2665");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.click(screen.getByRole("button", { name: "AANSH KUMAWAT photo" }));
    await screen.findByRole("dialog");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("offers the action under the photo, and closes before running it", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <StudentAvatarButton
          photoPath="student-1/photo.jpg"
          fullName="AANSH KUMAWAT"
          admissionNo="2665"
          action={{ label: "Change photo", onSelect }}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "AANSH KUMAWAT photo" }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Change photo" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    // The uploader is itself an overlay; stacking two scrims reads as the app
    // losing its place, so the viewer gets out of the way first.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("shows no action when none is given", async () => {
    const user = userEvent.setup();
    renderViewer();

    await user.click(screen.getByRole("button", { name: "AANSH KUMAWAT photo" }));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).queryByRole("button", { name: /change photo/i })).not.toBeInTheDocument();
  });

  it("renders a plain avatar, and no control, when there is no photo", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <StudentAvatarButton photoPath={null} fullName="NO PHOTO CHILD" />
      </NextIntlClientProvider>,
    );

    // A tappable control that opens an empty box is worse than no control.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "NO PHOTO CHILD photo" })).toBeInTheDocument();
  });
});
