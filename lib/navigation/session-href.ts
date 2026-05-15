type SessionSearchParams = {
  get(name: string): string | null;
};

export function appendSessionParam(href: string, session: string | null | undefined) {
  const trimmedSession = session?.trim();

  if (!trimmedSession || !href.startsWith("/protected")) {
    return href;
  }

  const [pathWithQuery, hash = ""] = href.split("#", 2);
  const [pathname, query = ""] = pathWithQuery.split("?", 2);
  const params = new URLSearchParams(query);
  params.set("session", trimmedSession);

  const nextHref = `${pathname}?${params.toString()}`;
  return hash ? `${nextHref}#${hash}` : nextHref;
}

export function appendCurrentSessionParam(
  href: string,
  searchParams: SessionSearchParams | null | undefined,
) {
  return appendSessionParam(href, searchParams?.get("session"));
}
