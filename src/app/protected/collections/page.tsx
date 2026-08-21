import { redirect } from "next/navigation";

type CollectionsAliasProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CollectionsAliasPage({ searchParams }: CollectionsAliasProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const params = new URLSearchParams();
  if (resolved) {
    for (const [key, value] of Object.entries(resolved)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) params.append(key, item);
      } else {
        params.append(key, value);
      }
    }
  }
  const query = params.toString();
  redirect(query ? `/protected/payments?${query}` : "/protected/payments");
}
