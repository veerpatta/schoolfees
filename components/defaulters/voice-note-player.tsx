"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  path: string;
  label?: string;
};

export function VoiceNotePlayer({ path, label }: Props) {
  const t = useTranslations("Defaulters");
  const resolvedLabel = label ?? t("voiceNotePlay");
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/protected/defaulters/voice-note?path=${encodeURIComponent(path)}`,
        { headers: { accept: "application/json" } },
      );
      if (!response.ok) {
        throw new Error(t("voiceNoteLoadStatus", { status: response.status }));
      }
      const data = (await response.json()) as { url?: string };
      if (!data.url) throw new Error(t("voiceNoteUnavailable"));
      setSrc(data.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("voiceNoteLoadFailed"));
    } finally {
      setLoading(false);
    }
  }

  if (src) {
    return <audio controls src={src} preload="metadata" className="h-9 max-w-[280px]" />;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={load}
        disabled={loading}
        className="gap-2"
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Play className="size-3.5" aria-hidden="true" />
        )}
        {resolvedLabel}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
