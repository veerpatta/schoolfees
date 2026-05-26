"use client";

import { usePathname } from "next/navigation";

import { RouteErrorState } from "@/components/admin/route-error-state";

export default function AdminToolsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const isPermission =
    error.message?.startsWith("You do not have permission") ||
    error.message?.startsWith("You do not have any required permissions");

  const title = isPermission ? "Access not permitted" : "Admin Tools hit an error";
  const description = isPermission
    ? "Your current staff role does not include permission for this section."
    : "A data load or environment dependency failed before this page could render. Try again, or contact an admin if the problem persists.";
  const showTechnical = process.env.NODE_ENV !== "production";
  const technical =
    !isPermission && showTechnical
      ? ` Route: ${pathname}. Digest: ${error.digest ?? "n/a"}. Error: ${error.message}`
      : "";

  return (
    <RouteErrorState
      title={title}
      description={`${description}${technical}`}
      errorDigest={error.digest}
      reset={reset}
      homeHref="/protected"
      homeLabel="Back to dashboard"
    />
  );
}
