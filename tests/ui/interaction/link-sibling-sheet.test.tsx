import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import messages from "@/messages/en.json";
import type { LinkSiblingActionState } from "@/app/protected/students/sibling-action-state";

/**
 * The picker as staff actually use it.
 *
 * Two reported bugs live here: selecting a student made the list disappear
 * (so a second and third sibling could never be added), and there was no way
 * to link three children at all. These assert on the rendered list and on what
 * the form actually posts, which source-string checks cannot see.
 */

const submissions: string[][] = [];
const linkSiblingsAction = vi.fn(
  async (_previous: LinkSiblingActionState, formData: FormData): Promise<LinkSiblingActionState> => {
    submissions.push(formData.getAll("siblingStudentIds").map(String));
    return { status: "success", message: "Linked.", familyGroupId: "family-1" };
  },
);

vi.mock("@/app/protected/students/sibling-actions", () => ({
  linkSiblingsAction: (previous: LinkSiblingActionState, formData: FormData) =>
    linkSiblingsAction(previous, formData),
}));

const { LinkSiblingSheet } = await import("@/components/students/link-sibling-sheet");

const SESSION = "TEST-2026-27";
const INDEX_STUDENTS = [
  { id: "student-b", fullName: "TEST Bhavna Sharma", admissionNo: "TEST-201", classLabel: "Class 5" },
  { id: "student-c", fullName: "TEST Chirag Sharma", admissionNo: "TEST-202", classLabel: "Nursery" },
  { id: "student-d", fullName: "TEST Divya Sharma", admissionNo: "TEST-203", classLabel: "Class 8" },
  { id: "student-x", fullName: "TEST Unrelated Child", admissionNo: "TEST-999", classLabel: "Class 3" },
];

function Harness({ excludeStudentIds = [] as string[] }) {
  const [open, setOpen] = useState(true);
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Kolkata">
      <LinkSiblingSheet
        open={open}
        onClose={() => setOpen(false)}
        studentId="student-a"
        studentLabel="TEST Aarav Sharma"
        studentAdmissionNo="TEST-200"
        studentClassLabel="Class 10"
        studentFatherName="TEST Father"
        studentPhone="9000000001"
        sessionLabel={SESSION}
        excludeStudentIds={excludeStudentIds}
      />
    </NextIntlClientProvider>
  );
}

function results() {
  return screen.getByRole("list", { name: "Search results" });
}

function rowFor(name: string) {
  return within(results()).getByRole("button", { name: new RegExp(name) });
}

function queryRowFor(name: string) {
  return within(results()).queryByRole("button", { name: new RegExp(name) });
}

beforeEach(() => {
  submissions.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ students: INDEX_STUDENTS }),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LinkSiblingSheet", () => {
  it("keeps the student list on screen after a selection", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(rowFor("TEST Bhavna Sharma")).toBeInTheDocument());
    await user.click(rowFor("TEST Bhavna Sharma"));

    // The row is still there, now marked as chosen — it does not vanish.
    const row = rowFor("TEST Bhavna Sharma");
    expect(row).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-pressed", "true");
    expect(rowFor("TEST Chirag Sharma")).toBeInTheDocument();
  });

  it("links three siblings in one submission", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(rowFor("TEST Bhavna Sharma")).toBeInTheDocument());
    await user.click(rowFor("TEST Bhavna Sharma"));
    await user.click(rowFor("TEST Chirag Sharma"));
    await user.click(rowFor("TEST Divya Sharma"));

    const confirm = screen.getByRole("button", { name: /Link 3 siblings/ });
    await user.click(confirm);

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0].sort()).toEqual(["student-b", "student-c", "student-d"]);
  });

  it("survives typing between selections", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(rowFor("TEST Bhavna Sharma")).toBeInTheDocument());
    await user.click(rowFor("TEST Bhavna Sharma"));

    const search = screen.getByLabelText("Search by name, SR no, or class");
    await user.type(search, "Chirag");
    expect(queryRowFor("TEST Divya Sharma")).not.toBeInTheDocument();

    await user.click(rowFor("TEST Chirag Sharma"));
    await user.click(screen.getByRole("button", { name: /Link 2 siblings/ }));

    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0].sort()).toEqual(["student-b", "student-c"]);
  });

  it("lets a selection be taken back from the chip", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await waitFor(() => expect(rowFor("TEST Bhavna Sharma")).toBeInTheDocument());
    await user.click(rowFor("TEST Bhavna Sharma"));

    const selectedPanel = screen.getByText("1 selected").closest("div") as HTMLElement;
    await user.click(within(selectedPanel).getByRole("button", { name: /Remove from selection/ }));

    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
    expect(rowFor("TEST Bhavna Sharma")).toHaveAttribute("aria-pressed", "false");
  });

  it("cannot submit with nothing selected", async () => {
    render(<Harness />);

    await waitFor(() => expect(rowFor("TEST Bhavna Sharma")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Confirm sibling link/ })).toBeDisabled();
  });

  it("hides students who are already in the family", async () => {
    render(<Harness excludeStudentIds={["student-b"]} />);

    await waitFor(() => expect(rowFor("TEST Chirag Sharma")).toBeInTheDocument());
    expect(queryRowFor("TEST Bhavna Sharma")).not.toBeInTheDocument();
  });
});
