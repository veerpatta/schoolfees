import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getAuthenticatedStaff = vi.fn();
const hasAnyStaffPermission = vi.fn();
const getStudentPhotoIdentity = vi.fn();
const recordActivity = vi.fn();
const download = vi.fn();

vi.mock("@/platform/supabase/session", () => ({
  getAuthenticatedStaff,
  hasAnyStaffPermission,
}));

vi.mock("@/platform/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    storage: { from: () => ({ download }) },
  })),
}));

vi.mock("@/modules/students/data/queries", () => ({ getStudentPhotoIdentity }));
vi.mock("@/modules/activity/data/events", () => ({ recordActivity }));

// after() runs its callback on a later tick in Next; running it immediately
// keeps the assertion about the audit row in the same test.
vi.mock("next/server", () => ({ after: (fn: () => void) => fn() }));

const STUDENT_ID = "101f3123-8e87-41e9-a60e-1a5eef27943c";

function request(query: string) {
  return new Request(`http://localhost/protected/students/photo/download${query}`);
}

function photoBlob() {
  return {
    stream: () => new ReadableStream(),
    type: "image/jpeg",
  };
}

describe("student photo download route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthenticatedStaff.mockResolvedValue({ id: "staff-1", isActive: true, appRole: "admin" });
    hasAnyStaffPermission.mockReturnValue(true);
    getStudentPhotoIdentity.mockResolvedValue({
      id: STUDENT_ID,
      admissionNo: "2166",
      fullName: "SADHANA KANWAR CHUNDAWAT",
      photoPath: `${STUDENT_ID}/1755612345678-k3p9xq.jpg`,
    });
    download.mockResolvedValue({ data: photoBlob(), error: null });
  });

  it("serves the photo as an attachment named SR-then-name", async () => {
    const { GET } = await import("@/app/protected/students/photo/download/route");
    const response = await GET(request(`?studentId=${STUDENT_ID}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="2166-SADHANA-KANWAR-CHUNDAWAT.jpg"; ' +
        "filename*=UTF-8''2166-SADHANA-KANWAR-CHUNDAWAT.jpg",
    );
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    // An attachment carrying a child's name has no business in a disk cache.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("carries the filename in a header the share path can read back", async () => {
    const { GET } = await import("@/app/protected/students/photo/download/route");
    const response = await GET(request(`?studentId=${STUDENT_ID}`));

    expect(decodeURIComponent(response.headers.get("X-Download-Filename") ?? "")).toBe(
      "2166-SADHANA-KANWAR-CHUNDAWAT.jpg",
    );
  });

  it("refuses a role that may only view students", async () => {
    hasAnyStaffPermission.mockReturnValue(false);

    const { GET } = await import("@/app/protected/students/photo/download/route");
    const response = await GET(request(`?studentId=${STUDENT_ID}`));

    expect(response.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller, and a deactivated one", async () => {
    const { GET } = await import("@/app/protected/students/photo/download/route");

    getAuthenticatedStaff.mockResolvedValue(null);
    expect((await GET(request(`?studentId=${STUDENT_ID}`))).status).toBe(401);

    // A live cookie is not the same as a live account.
    getAuthenticatedStaff.mockResolvedValue({ id: "staff-1", isActive: false, appRole: "admin" });
    expect((await GET(request(`?studentId=${STUDENT_ID}`))).status).toBe(401);
  });

  it("rejects anything that is not a uuid instead of handing it to Postgres", async () => {
    const { GET } = await import("@/app/protected/students/photo/download/route");

    for (const bad of ["", "abc", "../secrets", `${STUDENT_ID}' or 1=1--`]) {
      const response = await GET(request(`?studentId=${encodeURIComponent(bad)}`));
      expect(response.status).toBe(400);
    }
    expect(getStudentPhotoIdentity).not.toHaveBeenCalled();
  });

  it("404s when the student has no photograph", async () => {
    getStudentPhotoIdentity.mockResolvedValue({
      id: STUDENT_ID,
      admissionNo: "2166",
      fullName: "SADHANA KANWAR CHUNDAWAT",
      photoPath: null,
    });

    const { GET } = await import("@/app/protected/students/photo/download/route");
    const response = await GET(request(`?studentId=${STUDENT_ID}`));

    expect(response.status).toBe(404);
    expect(download).not.toHaveBeenCalled();
  });

  it("records the download against the student", async () => {
    const { GET } = await import("@/app/protected/students/photo/download/route");
    await GET(request(`?studentId=${STUDENT_ID}&via=share`));

    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "staff-1",
        kind: "student_photo_downloaded",
        refId: STUDENT_ID,
        payload: expect.objectContaining({
          admissionNo: "2166",
          fileName: "2166-SADHANA-KANWAR-CHUNDAWAT.jpg",
          via: "share",
        }),
      }),
    );
  });

  it("never names a path the caller supplied", async () => {
    const { GET } = await import("@/app/protected/students/photo/download/route");
    await GET(request(`?studentId=${STUDENT_ID}&path=other-child/secret.jpg`));

    // The object downloaded is the one on the student's record, not the one in
    // the query string — the rule that stops this being an arbitrary read.
    expect(download).toHaveBeenCalledWith(`${STUDENT_ID}/1755612345678-k3p9xq.jpg`);
  });
});
