"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { toast, type ToastTone } from "@/components/ui/toast";

export type FlashMessage = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type FlashNoticeProps = {
  /** Keyed by the value the server action put in `?done=`. */
  messages: Record<string, FlashMessage>;
  /** Query key to read. Defaults to "done". */
  param?: string;
};

/**
 * Announces the result of an action that finished with a `redirect()`.
 *
 * Server actions that redirect cannot hand anything back to `useActionState`,
 * so surfaces built that way used to land on a fresh page with no indication
 * anything had happened. The action redirects to `?done=<key>`; this reads the
 * key, toasts once, then strips the param so a refresh or a back-navigation
 * does not replay the message.
 *
 * Renders nothing.
 */
export function FlashNotice({ messages, param = "done" }: FlashNoticeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const announced = useRef<string | null>(null);

  const key = searchParams.get(param);

  useEffect(() => {
    if (!key || announced.current === key) {
      return;
    }

    const message = messages[key];

    if (!message) {
      return;
    }

    announced.current = key;
    toast({
      title: message.title,
      description: message.description,
      tone: message.tone ?? "success",
    });

    // Drop the param so a reload does not re-announce. `replace` keeps it out
    // of history, so Back returns to the previous page rather than re-firing.
    const next = new URLSearchParams(searchParams.toString());
    next.delete(param);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [key, messages, param, pathname, router, searchParams]);

  return null;
}
