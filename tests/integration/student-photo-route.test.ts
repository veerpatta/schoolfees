import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const requireStaffPermission = vi.fn();
const createSignedUrl = vi.fn();

vi.mock("@/lib/supabase/session", () => ({
  requireStaffPermission,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    storage: {
      from: () => ({
        createSignedUrl,
      }),
    },
  })),
}));

function request(path: string) {
  return new Request(`http://localhost${path}`);
}

describe("student photo route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireStaffPermission.mockResolvedValue({ appRole: "admin" });
  });

  it("returns a signed url with a private cache header when the file exists", async () => {
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.test/abc?token=xyz" },
      error: null,
    });

    const { GET } = await import("@/app/protected/students/photo/route");
    const response = await GET(request("/protected/students/photo?path=students/abc.jpg"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    expect(body.url).toBe("https://example.test/abc?token=xyz");
    expect(response.headers.get("Cache-Control")).toMatch(/private/);
  });

  it("returns 200 with null url instead of 404 when the photo is missing", async () => {
    createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "Object not found" },
    });

    const { GET } = await import("@/app/protected/students/photo/route");
    const response = await GET(request("/protected/students/photo?path=students/missing.jpg"));

    // Missing photos are normal for many students. The 200 + null response
    // lets the avatar fall back to initials without polluting console/network
    // monitoring with expected 404 noise on list views (smoke BUG-006).
    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string | null };
    expect(body.url).toBeNull();
    expect(response.headers.get("Cache-Control")).toMatch(/private/);
  });

  it("rejects path traversal attempts with a 400", async () => {
    const { GET } = await import("@/app/protected/students/photo/route");
    const response = await GET(request("/protected/students/photo?path=../etc/passwd"));

    expect(response.status).toBe(400);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
