import Link from "next/link";
import { History } from "lucide-react";

import { cn } from "@/lib/utils";

type AuditLinkProps = {
  /** Backend record id — used to deep-link the audit explorer. */
  recordId: string;
  /** Visible label. Defaults to "View audit trail". */
  label?: string;
  /** Optional resource type for the URL (defaults to generic). */
  kind?: "receipt" | "payment" | "adjustment" | "student";
  className?: string;
};

/**
 * Small "View audit trail" link to drop next to any money number or
 * mutation surface. Resolves to /protected/admin-tools/audit?recordId=…
 * — an admin-only route (already gated in the existing router).
 */
export function AuditLink({
  recordId,
  label = "View audit trail",
  kind,
  className,
}: AuditLinkProps) {
  const params = new URLSearchParams({ recordId });
  if (kind) params.set("kind", kind);
  const href = `/protected/admin-tools/audit?${params.toString()}`;
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline",
        className,
      )}
    >
      <History className="size-3" aria-hidden="true" />
      {label}
    </Link>
  );
}
