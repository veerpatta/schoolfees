import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudentFeePlanEditButton } from "@/modules/students/ui/student-fee-plan-edit-button";
import type { StudentFeePlanHead } from "@/modules/students/ui/student-fee-plan-sheet";

// The sheet imports a "use server" module; stub it so the client tree renders.
vi.mock("@/app/protected/students/fee-plan-actions", () => ({
  saveStudentFeePlanAction: vi.fn(async () => ({
    status: "idle",
    message: null,
    duesNeedAttention: false,
  })),
}));

const BASE_PROPS = {
  studentId: "student-1",
  studentLabel: "TEST Student One",
  sessionLabel: "TEST-2026-27",
  currentTuitionOverride: null,
  currentTransportOverride: null,
  classDefaultTuitionFee: 16000,
  routeDefaultTransportFee: 0,
  currentHeads: [] as StudentFeePlanHead[],
  conventionalDiscountLabels: [] as string[],
};

function setViewport(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

async function openSheet(props = BASE_PROPS) {
  const user = userEvent.setup();
  render(<StudentFeePlanEditButton {...props} />);
  await user.click(screen.getByRole("button", { name: /edit custom fees/i }));
  return user;
}

describe("StudentFeePlanEditButton — desktop-only gate", () => {
  it("renders nothing below 768px", () => {
    setViewport(false);
    const { container } = render(<StudentFeePlanEditButton {...BASE_PROPS} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("button", { name: /edit custom fees/i })).toBeNull();
  });

  it("renders the trigger on desktop", () => {
    setViewport(true);
    render(<StudentFeePlanEditButton {...BASE_PROPS} />);

    expect(screen.getByRole("button", { name: /edit custom fees/i })).toBeInTheDocument();
  });
});

describe("StudentFeePlanSheet", () => {
  beforeEach(() => {
    setViewport(true);
  });

  it("shows the class default so the reset option names a real figure", async () => {
    await openSheet();

    expect(screen.getByLabelText(/class default/i)).toBeInTheDocument();
    expect(screen.getByText(/Class default/i).textContent).toMatch(/16,000/);
  });

  it("keeps the custom tuition input disabled until custom mode is chosen", async () => {
    const user = await openSheet();
    const amount = screen.getByLabelText(/custom tuition amount/i);

    expect(amount).toBeDisabled();

    // Tuition and transport each have a "Custom amount" radio; the first is tuition.
    const [tuitionCustom] = screen.getAllByRole("radio", { name: /custom amount/i });
    await user.click(tuitionCustom!);
    expect(amount).toBeEnabled();
  });

  it("warns that a custom tuition replaces an assigned conventional policy", async () => {
    const user = await openSheet({
      ...BASE_PROPS,
      conventionalDiscountLabels: ["Staff Child"],
    });

    expect(screen.queryByText(/replaces Staff Child/i)).toBeNull();

    const [tuitionCustom] = screen.getAllByRole("radio", { name: /custom amount/i });
    await user.click(tuitionCustom!);

    expect(screen.getByText(/replaces Staff Child/i)).toBeInTheDocument();
  });

  it("adds and removes named fee head rows", async () => {
    const user = await openSheet();

    expect(screen.queryByLabelText(/^name$/i)).toBeNull();

    await user.click(screen.getByRole("button", { name: /add fee head/i }));
    const label = screen.getByLabelText(/^name$/i);
    await user.type(label, "Uniform adj.");
    expect(label).toHaveValue("Uniform adj.");

    await user.click(screen.getByRole("button", { name: /remove uniform adj\./i }));
    expect(screen.queryByLabelText(/^name$/i)).toBeNull();
  });

  it("pre-fills existing named heads with their stored labels", async () => {
    await openSheet({
      ...BASE_PROPS,
      currentHeads: [
        { id: "uniform_adj", label: "Uniform adj.", amount: 800 },
        { id: "lab_fee", label: "Lab fee", amount: 1200 },
      ],
    });

    const labels = screen.getAllByLabelText(/^name$/i);
    expect(labels.map((input) => (input as HTMLInputElement).value)).toEqual([
      "Uniform adj.",
      "Lab fee",
    ]);
  });

  it("keeps the save button disabled until a reason is entered", async () => {
    const user = await openSheet();
    const save = screen.getByRole("button", { name: /save fee plan/i });

    expect(save).toBeDisabled();

    await user.type(screen.getByLabelText(/^reason$/i), "Principal approved");
    expect(save).toBeEnabled();
  });

  it("disables save while a named head has a non-positive amount", async () => {
    const user = await openSheet();
    await user.type(screen.getByLabelText(/^reason$/i), "Principal approved");

    await user.click(screen.getByRole("button", { name: /add fee head/i }));
    await user.type(screen.getByLabelText(/^name$/i), "Uniform adj.");
    await user.type(screen.getByLabelText(/^amount$/i), "0");

    expect(screen.getByRole("button", { name: /save fee plan/i })).toBeDisabled();
  });

  it("posts the session label and tuition mode as hidden fields", async () => {
    await openSheet();
    const form = document.getElementById("student-fee-plan-form") as HTMLFormElement;

    const hidden = Array.from(
      form.querySelectorAll<HTMLInputElement>('input[type="hidden"]'),
    ).map((input) => [input.name, input.value]);

    expect(Object.fromEntries(hidden)).toMatchObject({
      studentId: "student-1",
      sessionLabel: "TEST-2026-27",
      tuitionMode: "default",
      transportMode: "default",
    });
  });
});
