import "server-only";

/**
 * Phase 0 perf instrumentation — per-call server timing for hot authenticated
 * routes.
 *
 * Emits one structured, greppable line per request to stdout so it can be read
 * back from Vercel runtime logs (filter on the `[perf]` prefix), and exposes a
 * `Server-Timing` header value for route handlers that can set response
 * headers. Each line is tagged with `VERCEL_REGION` so an `iad1` baseline and a
 * `bom1` follow-up are unambiguous in the same log stream.
 *
 * Per-call (not just total) timing is deliberate: it lets later phases attribute
 * a TTFB change to a specific data loader (region vs. waterfall vs. matview)
 * rather than a single opaque number.
 *
 * Enabled automatically on Vercel preview deployments (so before/after
 * measurement needs no env wiring), or anywhere `PERF_TIMING=1` is set. Off by
 * default in production so the log stream stays clean.
 */

const ENABLED =
  process.env.PERF_TIMING === "1" || process.env.VERCEL_ENV === "preview";

export function perfEnabled(): boolean {
  return ENABLED;
}

export class ServerTimer {
  private readonly entries: Array<{ name: string; dur: number }> = [];
  private readonly start = performance.now();

  constructor(private readonly scope: string) {}

  /**
   * Time an async call, record its duration, and return its result. When
   * disabled this is a thin pass-through that adds no measurement overhead.
   */
  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!ENABLED) return fn();
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      this.entries.push({ name, dur: performance.now() - t0 });
    }
  }

  /** Record a duration measured elsewhere (e.g. a single leg of a Promise.all). */
  mark(name: string, dur: number): void {
    if (!ENABLED) return;
    this.entries.push({ name, dur });
  }

  private totalMs(): number {
    return performance.now() - this.start;
  }

  /** `Server-Timing` header value for route handlers that can set headers. */
  header(): string {
    return [
      ...this.entries.map((e) => `${e.name};dur=${e.dur.toFixed(1)}`),
      `total;dur=${this.totalMs().toFixed(1)}`,
    ].join(", ");
  }

  /** Emit one structured line to stdout (visible in Vercel runtime logs). */
  flush(): void {
    if (!ENABLED) return;
    const parts = this.entries
      .map((e) => `${e.name}=${e.dur.toFixed(1)}`)
      .join(" ");
    console.log(
      `[perf] scope=${this.scope} ${parts} total=${this.totalMs().toFixed(1)} region=${
        process.env.VERCEL_REGION ?? "local"
      }`,
    );
  }
}
