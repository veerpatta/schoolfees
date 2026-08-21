import { redirect } from "next/navigation";

type DuesAliasPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DuesAliasPage({ searchParams }: DuesAliasPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const params = new URLSearchParams();

  Object.entries(resolvedSearchParams).forEach(([key, value]) => {
    const normalizedValue = firstParam(value);

    if (normalizedValue) {
      params.set(key, normalizedValue);
    }
  });

  const queryString = params.toString();

  redirect(`/protected/transactions${queryString ? `?${queryString}` : ""}`);
}
