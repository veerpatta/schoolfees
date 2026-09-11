import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

import { useStudentPhotoShare } from "@/modules/students/ui/student-photo-share-action";

const toast = vi.fn();
vi.mock("@/ui/primitives/toast", () => ({ toast: (...args: unknown[]) => toast(...args) }));

const LABELS = {
  share: "Share",
  send: "Send",
  preparing: "Preparing",
  failed: "Could not share",
};

function setup() {
  return renderHook(() =>
    useStudentPhotoShare({
      studentId: "101f3123-8e87-41e9-a60e-1a5eef27943c",
      studentName: "SADHANA KANWAR CHUNDAWAT",
      admissionNo: "2166",
      labels: LABELS,
    }),
  );
}

function photoResponse() {
  return {
    ok: true,
    blob: async () => new Blob(["x"], { type: "image/jpeg" }),
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "x-download-filename"
          ? encodeURIComponent("2166-SADHANA-KANWAR-CHUNDAWAT.jpg")
          : null,
    },
  };
}

describe("useStudentPhotoShare", () => {
  let share: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    vi.stubGlobal("fetch", vi.fn(async () => photoResponse()));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * The rule this whole hook exists to keep: `navigator.share` must run on a
   * live user gesture. Fetching inside the sharing click consumes the transient
   * activation iOS Safari requires and the share is refused.
   */
  it("fetches on the first press and shares on the second", async () => {
    const { result } = setup();

    expect(result.current.action.label).toBe("Share");

    await act(async () => {
      result.current.action.onSelect();
    });

    await waitFor(() => expect(result.current.action.label).toBe("Send"));
    expect(fetch).toHaveBeenCalledTimes(1);
    // Nothing has been shared yet — the first press only prepared the file.
    expect(share).not.toHaveBeenCalled();

    const fetchCallsBeforeShare = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      result.current.action.onSelect();
    });

    expect(share).toHaveBeenCalledTimes(1);
    // No fetch between the gesture and share() — that is the whole point.
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(
      fetchCallsBeforeShare,
    );
  });

  it("names the file from the response, not from its own formatting", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.action.onSelect();
    });
    await waitFor(() => expect(result.current.action.label).toBe("Send"));
    await act(async () => {
      result.current.action.onSelect();
    });

    const [data] = share.mock.calls[0] as [{ files: File[] }];
    expect(data.files[0]?.name).toBe("2166-SADHANA-KANWAR-CHUNDAWAT.jpg");
  });

  it("asks the download route for the bytes, tagged as a share", async () => {
    const { result } = setup();

    await act(async () => {
      result.current.action.onSelect();
    });

    const [url] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("/protected/students/photo/download");
    expect(url).toContain("via=share");
  });

  /** A cancelled share is a decision, not a failure. */
  it("stays silent when the staff member dismisses the share sheet", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    share.mockRejectedValue(abort);

    const { result } = setup();
    await act(async () => {
      result.current.action.onSelect();
    });
    await waitFor(() => expect(result.current.action.label).toBe("Send"));
    await act(async () => {
      result.current.action.onSelect();
    });

    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(toast).not.toHaveBeenCalled();
  });

  it("reports a real failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403 })));

    const { result } = setup();
    await act(async () => {
      result.current.action.onSelect();
    });

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Could not share" }));
    // Still offering the first press, not a Send that would share nothing.
    expect(result.current.action.label).toBe("Share");
  });

  it("is unsupported where the browser has no share sheet", () => {
    Object.assign(navigator, { share: undefined });
    const { result } = setup();
    expect(result.current.supported).toBe(false);
  });
});
