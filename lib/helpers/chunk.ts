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
): Promise<{ data: T[]; error: unknown }> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error(`fetchAllPages pageSize must be a positive integer, got ${pageSize}`);
  }

  const data: T[] = [];
  let from = 0;

  for (;;) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) {
      return { data, error: result.error };
    }

    const page = result.data ?? [];
    data.push(...page);

    // Short page — including an empty one — means the server had nothing more
    // to give. A full page might be the end too, but we cannot tell, so we ask
    // again and accept one extra round trip over losing rows.
    if (page.length < pageSize) {
      return { data, error: null };
    }

    from += pageSize;
  }
}
