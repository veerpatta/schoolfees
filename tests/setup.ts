import { afterEach, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache:
    <T extends (...args: unknown[]) => unknown>(callback: T) =>
    callback,
}));

// `server-only` is a Next.js marker module not installed in this repo's
// node_modules. SSR-style component tests can transitively touch
// server-flagged modules; stub it so imports don't blow up.
vi.mock("server-only", () => ({}));

// Stub the Next navigation hooks for component tests rendered with
// renderToStaticMarkup outside an app router context.
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
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
  };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
