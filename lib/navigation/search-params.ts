/**
 * One way to read a search param, whichever side of the wire you are on.
 *
 * A Server Component gets a plain object (with `string[]` on a repeated key); a
 * Route Handler gets `URLSearchParams`. A filter normalizer that took one of
 * those directly could only ever serve one of the two, which is how Students
 * ended up with two normalizers that disagreed about the default status.
 *
 * These lived in `lib/students/filter-params.ts` until Receipts needed them
 * too; `lib/receipts/*` importing from `lib/students/*` would tie two unrelated
 * modules together for three functions. The students file re-exports them, so
 * every existing import still resolves.
 */

export type SearchParamReader = (key: string) => string | undefined;

export function readerFromRecord(
  params: Record<string, string | string[] | undefined> | undefined,
): SearchParamReader {
  return (key) => {
    const value = params?.[key];
    return Array.isArray(value) ? value[0] : value;
  };
}

export function readerFromSearchParams(params: URLSearchParams): SearchParamReader {
  return (key) => params.get(key) ?? undefined;
}
