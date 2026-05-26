"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Copy, Link2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  createStudentShareLinkAction,
  revokeStudentShareLinkAction,
} from "@/app/protected/students/[studentId]/share-link/actions";

type Link = {
  id: string;
  token: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  viewCount: number;
  lastViewedAt: string | null;
};

type Props = {
  studentId: string;
  initialLinks: Link[];
  baseUrl: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
}

export function ParentShareLinkCard({ studentId, initialLinks, baseUrl }: Props) {
  const tToasts = useTranslations("Toasts");
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [isPending, startTransition] = useTransition();
  const activeLinks = links.filter((link) => !link.revokedAt && new Date(link.expiresAt).getTime() > Date.now());

  function buildUrl(token: string) {
    return `${baseUrl}/share/${token}`;
  }

  function handleGenerate() {
    startTransition(async () => {
      try {
        const link = await createStudentShareLinkAction(studentId);
        setLinks((previous) => [
          {
            id: link.id,
            token: link.token,
            expiresAt: link.expiresAt,
            revokedAt: link.revokedAt,
            createdAt: link.createdAt,
            viewCount: link.viewCount,
            lastViewedAt: link.lastViewedAt,
          },
          ...previous,
        ]);
        try {
          await navigator.clipboard.writeText(buildUrl(link.token));
          toast({
            title: tToasts("shareLinkCopiedTitle"),
            description: tToasts("shareLinkCopiedDescription"),
          });
        } catch {
          toast({
            title: tToasts("shareLinkReadyTitle"),
            description: tToasts("shareLinkReadyDescription"),
          });
        }
      } catch (error) {
        toast({
          title: tToasts("shareLinkCreateFailTitle"),
          description: error instanceof Error ? error.message : tToasts("unknownError"),
        });
      }
    });
  }

  function handleRevoke(linkId: string) {
    startTransition(async () => {
      try {
        await revokeStudentShareLinkAction({ linkId, studentId });
        setLinks((previous) =>
          previous.map((link) =>
            link.id === linkId ? { ...link, revokedAt: new Date().toISOString() } : link,
          ),
        );
        toast({
          title: tToasts("shareLinkRevokedTitle"),
          description: tToasts("shareLinkRevokedDescription"),
        });
      } catch (error) {
        toast({
          title: tToasts("shareLinkRevokeFailTitle"),
          description: error instanceof Error ? error.message : tToasts("unknownError"),
        });
      }
    });
  }

  async function handleCopy(token: string) {
    try {
      await navigator.clipboard.writeText(buildUrl(token));
      toast({ title: tToasts("linkCopiedTitle") });
    } catch {
      toast({
        title: tToasts("copyFailedTitle"),
        description: tToasts("copyFailedDescription"),
      });
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Share with parent</h2>
          <p className="text-xs text-muted-foreground">
            Generate a read-only URL for this student. 90-day expiry, revocable at any time.
          </p>
        </div>
        <Button type="button" size="sm" onClick={handleGenerate} disabled={isPending} className="gap-2">
          <Link2 className="size-4" aria-hidden="true" />
          Generate new link
        </Button>
      </div>

      {activeLinks.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border-strong bg-surface-2 px-3 py-2 text-xs text-muted-foreground">
          No active links yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {activeLinks.map((link) => (
            <li key={link.id} className="space-y-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Expires {formatDate(link.expiresAt)}</span>
                <span>{link.viewCount} view{link.viewCount === 1 ? "" : "s"}</span>
              </div>
              <code className="block break-all rounded bg-card px-2 py-1 font-mono text-xs">
                {buildUrl(link.token)}
              </code>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => handleCopy(link.token)}
                >
                  <Copy className="size-3.5" aria-hidden="true" /> Copy
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-destructive"
                  onClick={() => handleRevoke(link.id)}
                  disabled={isPending}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" /> Revoke
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
