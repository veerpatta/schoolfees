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
