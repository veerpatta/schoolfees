"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type OfficeSyncListenerProps = {
  sessionLabel: string;
};

export function OfficeSyncListener({ sessionLabel }: OfficeSyncListenerProps) {
  const router = useRouter();

  useEffect(() => {
    if (!sessionLabel) {
      return;
    }

    let supabase: ReturnType<typeof createClient>;

    try {
      supabase = createClient();
    } catch {
      return;
    }

    const channel = supabase
      .channel(`office-sync:${sessionLabel}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "office_sync_events",
          filter: `session_label=eq.${sessionLabel}`,
        },
        () => {
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, sessionLabel]);

  return null;
}
