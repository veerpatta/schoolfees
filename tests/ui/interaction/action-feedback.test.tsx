import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ToastViewport } from "@/ui/primitives/toast";
import { useActionFeedback, useActionFeedbackMany } from "@/ui/hooks/use-action-feedback";

const refresh = vi.fn();

vi.mock("next/navigation", async (original) => {
  const real = (await original()) as Record<string, unknown>;
  return {
    ...real,
    useRouter: () => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh,
      back: vi.fn(),
      forward: vi.fn(),
      prefetch: vi.fn(),
    }),
  };
});

type State = { status: string; message: string | null };

function Harness({ states }: { states: State[] }) {
  const [index, setIndex] = useState(0);
  useActionFeedback(states[index]!, { successTitle: "Saved it", errorTitle: "Nope" });

  return (
    <>
      <button type="button" onClick={() => setIndex((value) => value + 1)}>
        settle
      </button>
      <ToastViewport />
    </>
  );
}

function ManyHarness({ rounds }: { rounds: State[][] }) {
  const [index, setIndex] = useState(0);
  useActionFeedbackMany(rounds[index]!, { successTitle: "Saved it" });

  return (
    <>
      <button type="button" onClick={() => setIndex((value) => value + 1)}>
        settle
      </button>
      <ToastViewport />
    </>
  );
}

const idle: State = { status: "idle", message: null };

describe("useActionFeedback", () => {
  it("says nothing and does not refresh while idle", () => {
    render(<Harness states={[idle]} />);

    expect(screen.queryByText("Saved it")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("announces a success and refreshes the server data", async () => {
    const user = userEvent.setup();
    render(<Harness states={[idle, { status: "success", message: "Student saved." }]} />);

    await user.click(screen.getByRole("button", { name: "settle" }));

    expect(await screen.findByText("Saved it")).toBeInTheDocument();
    expect(screen.getByText("Student saved.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("announces a failure without refreshing", async () => {
    const user = userEvent.setup();
    render(<Harness states={[idle, { status: "error", message: "SR no did not match." }]} />);

    await user.click(screen.getByRole("button", { name: "settle" }));

    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(screen.getByText("SR no did not match.")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  // A failure with no sentence used to be indistinguishable from success.
  it("never fails silently, even with no message", async () => {
    const user = userEvent.setup();
    render(<Harness states={[idle, { status: "error", message: null }]} />);

    await user.click(screen.getByRole("button", { name: "settle" }));

    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
  });

  // Saving the same edit twice settles on an equal state; the second save must
  // still confirm itself.
  it("announces a repeat save with identical content", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        states={[
          idle,
          { status: "success", message: "Saved." },
          { status: "success", message: "Saved." },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "settle" }));
    await screen.findByText("Saved.");
    await user.click(screen.getByRole("button", { name: "settle" }));

    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("useActionFeedbackMany", () => {
  it("announces each newly settled action but refreshes once", async () => {
    const user = userEvent.setup();
    render(
      <ManyHarness
        rounds={[
          [idle, idle],
          [
            { status: "success", message: "Class created." },
            { status: "success", message: "Route created." },
          ],
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "settle" }));

    expect(await screen.findByText("Class created.")).toBeInTheDocument();
    expect(screen.getByText("Route created.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ignores actions still sitting idle", async () => {
    const user = userEvent.setup();
    render(
      <ManyHarness
        rounds={[
          [idle, idle],
          [{ status: "success", message: "Only this one." }, idle],
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "settle" }));

    expect(await screen.findByText("Only this one.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
