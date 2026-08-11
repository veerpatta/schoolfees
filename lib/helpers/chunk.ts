/**
 * Splits a list into consecutive chunks of at most `size` items.
 *
 * Primary use: batching id lists for PostgREST `.in(...)` filters, which are
 * serialized into the request URL — thousands of UUIDs in one filter overflow
 * the URL limit and fail the whole query.
 */
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error(`chunkArray size must be a positive integer, got ${size}`);
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * Runs `fetchChunk` for each chunk of `ids` sequentially and concatenates the
 * rows. Mirrors the `{ data, error }` shape of a supabase query so call sites
 * can swap a single `.in(...)` query for a chunked one without reshaping their
 * error handling. Stops at the first error.
 */
export async function fetchInChunks<T>(
  ids: readonly string[],
  size: number,
  fetchChunk: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<{ data: T[]; error: unknown }> {
  const data: T[] = [];
  for (const chunk of chunkArray(ids, size)) {
    const result = await fetchChunk(chunk);
    if (result.error) {
      return { data, error: result.error };
    }
    data.push(...(result.data ?? []));
  }
  return { data, error: null };
}

/** Rows requested per page. Any value below the server cap is safe. */
export const DEFAULT_PAGE_SIZE = 1000;

/**
 * How many pages to request at once *after* the first one.
 *
 * Two, not more, and deliberately not applied to page 0. Most queries here fit
 * in a single page (the live session has 535 financial rows), and those must
 * still cost exactly one request — a window that speculatively fired three
 * requests would triple the traffic of the common case to speed up the rare
 * one. Starting the window only once page 0 comes back full means we have
 * already been told there is more data before we guess at how much.
 *
 * At two, the 2,108-row installment view costs the same three requests it
 * always did, but in two round trips instead of three.
 */
export const DEFAULT_PAGE_CONCURRENCY = 2;

/**
 * Reads every row of a query by paging with `.range(...)`.
 *
 * PostgREST silently truncates a response at its `max-rows` ceiling — no error,
 * no flag, the array is just short. A query with no `.range()` over a view that
 * has outgrown that ceiling therefore returns a *plausible* half-answer, and
 * every total computed from it is quietly wrong. That is not hypothetical: the
 * dashboard's "expected this year" read ₹56.8L instead of ₹1.14 Cr because the
 * installment view crossed 1,000 rows, and the installment export was handing
 * the accountant a file missing half its rows.
 *
 * **Stops on a short page, never on a row count.** The ceiling is server-side
 * configuration that this code cannot see and must not assume: asking for
 * exactly the number we believe the cap to be would reintroduce the same silent
 * truncation the moment it changed. A page shorter than requested is the only
 * reliable end-of-data signal.
 *
 * Mirrors the `{ data, error }` shape of a supabase query so call sites keep
 * their existing error handling. Stops at the first error, returning whatever
 * was read so far alongside it.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize: number = DEFAULT_PAGE_SIZE,
  concurrency: number = DEFAULT_PAGE_CONCURRENCY,
): Promise<{ data: T[]; error: unknown }> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error(`fetchAllPages pageSize must be a positive integer, got ${pageSize}`);
  }
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error(
      `fetchAllPages concurrency must be a positive integer, got ${concurrency}`,
    );
  }

  const data: T[] = [];

  // Page 0 on its own. Until it comes back full there is no evidence a second
  // page exists, and speculating would make every single-page query pay for
  // requests it does not need.
  const firstResult = await fetchPage(0, pageSize - 1);
  if (firstResult.error) {
    return { data, error: firstResult.error };
  }
  const firstPage = firstResult.data ?? [];
  data.push(...firstPage);
  if (firstPage.length < pageSize) {
    return { data, error: null };
  }

  let from = pageSize;

  for (;;) {
    // The pages are independent `.range(...)` reads over a stably-ordered query,
    // so issuing a window of them at once only changes WHEN they are asked for,
    // never what comes back. They are still consumed strictly in page order
    // below, so both the short-page stop and "first error wins" are unchanged.
    const starts = Array.from({ length: concurrency }, (_, index) => from + index * pageSize);
    const results = await Promise.all(
      starts.map((start) => fetchPage(start, start + pageSize - 1)),
    );

    for (const result of results) {
      if (result.error) {
        return { data, error: result.error };
      }

      const page = result.data ?? [];
      data.push(...page);

      // Short page — including an empty one — means the server had nothing more
      // to give. A full page might be the end too, but we cannot tell, so we ask
      // again and accept one extra round trip over losing rows. Any page fetched
      // after this one in the same window is discarded unread, which is safe:
      // beyond the end of the data they can only be empty.
      if (page.length < pageSize) {
        return { data, error: null };
      }
    }

    from += concurrency * pageSize;
  }
}
