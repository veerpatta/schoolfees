import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  // Mirror Next.js's behavior: throw a sentinel so the caller stops execution.
  throw new RedirectInvocation(url);
});

class RedirectInvocation extends Error {
  constructor(public readonly url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect,
}));

async function invoke(searchParams?: Record<string, string | string[] | undefined>) {
  const mod = await import("@/app/protected/collections/page");
  return mod.default({
    searchParams: searchParams ? Promise.resolve(searchParams) : undefined,
  });
}

describe("/protected/collections alias", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /protected/payments when there are no query params", async () => {
    await expect(invoke()).rejects.toBeInstanceOf(RedirectInvocation);
    expect(redirect).toHaveBeenCalledWith("/protected/payments");
  });

  it("preserves query params through the redirect", async () => {
    await expect(invoke({ session: "TEST-2026-27" })).rejects.toBeInstanceOf(RedirectInvocation);
    expect(redirect).toHaveBeenCalledWith("/protected/payments?session=TEST-2026-27");
  });

  it("flattens repeated query params", async () => {
    await expect(invoke({ tag: ["a", "b"] })).rejects.toBeInstanceOf(RedirectInvocation);
    expect(redirect).toHaveBeenCalledWith("/protected/payments?tag=a&tag=b");
  });
});
