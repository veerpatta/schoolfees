"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Mic, Pause, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const MAX_RECORDING_MS = 60_000;
const BUCKET = "defaulter-voice-notes";

type Props = {
  studentId: string;
  /** Inputs the parent form submits as `voiceNotePath`. */
  inputName: string;
};

type RecorderState =
  | { status: "idle" }
  | { status: "recording"; startedAt: number }
  | { status: "stopping" }
  | { status: "uploading"; blob: Blob; objectUrl: string }
  | { status: "ready"; path: string; objectUrl: string }
  | { status: "error"; message: string };

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "audio/webm";
}

function fileExtension(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  if (mime.startsWith("audio/mpeg")) return "mp3";
  if (mime.startsWith("audio/wav")) return "wav";
  return "webm";
}

export function VoiceNoteRecorder({ studentId, inputName }: Props) {
  const [state, setState] = useState<RecorderState>({ status: "idle" });
  const [elapsedMs, setElapsedMs] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (stopTimeoutRef.current !== null) window.clearTimeout(stopTimeoutRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (state.status === "ready" || state.status === "uploading") {
        URL.revokeObjectURL(state.objectUrl);
      }
    };
    // We intentionally do not include `state` — cleanup runs once on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function uploadBlob(blob: Blob) {
    const supabase = createClient();
    const extension = fileExtension(blob.type);
    const objectName = `${studentId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const { error } = await supabase.storage.from(BUCKET).upload(objectName, blob, {
      contentType: blob.type,
      cacheControl: "private, max-age=0",
      upsert: false,
    });
    if (error) {
      throw new Error(error.message || "Upload failed");
    }
    return objectName;
  }

  async function startRecording() {
    if (typeof window === "undefined" || typeof navigator === "undefined") return;
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      setState({
        status: "error",
        message: "Audio recording is not supported in this browser.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        stopStream();
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);
        setState({ status: "uploading", blob, objectUrl });

        try {
          const path = await uploadBlob(blob);
          setState({ status: "ready", path, objectUrl });
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "Upload failed.",
          });
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      const startedAt = performance.now();
      setState({ status: "recording", startedAt });
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAt;
        setElapsedMs(elapsed);
        if (elapsed >= MAX_RECORDING_MS) {
          stopRecording();
        }
      }, 200);

      // Hard safety stop in case the interval misfires.
      stopTimeoutRef.current = window.setTimeout(() => {
        stopRecording();
      }, MAX_RECORDING_MS + 500);
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? `Could not start recording: ${error.message}`
            : "Could not start recording (microphone permission denied?).",
      });
      stopStream();
    }
  }

  function stopRecording() {
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      setState({ status: "stopping" });
      recorder.stop();
    }
  }

  function clearRecording() {
    if (state.status === "ready" || state.status === "uploading") {
      URL.revokeObjectURL(state.objectUrl);
    }
    setState({ status: "idle" });
    setElapsedMs(0);
  }

  const path = state.status === "ready" ? state.path : "";

  return (
    <div className="space-y-2 rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Voice note (optional, ≤ 60 s)
        </p>
        {state.status === "recording" ? (
          <span className="font-mono text-xs text-destructive">
            ● {Math.min(60, Math.floor(elapsedMs / 1000))}s / 60s
          </span>
        ) : null}
      </div>

      <input type="hidden" name={inputName} value={path} />

      <div className="flex flex-wrap items-center gap-2">
        {state.status === "idle" || state.status === "error" ? (
          <Button type="button" variant="outline" onClick={startRecording} className="gap-2">
            <Mic className="size-4" aria-hidden="true" /> Record
          </Button>
        ) : null}

        {state.status === "recording" ? (
          <Button type="button" variant="outline" onClick={stopRecording} className="gap-2">
            <Pause className="size-4" aria-hidden="true" /> Stop
          </Button>
        ) : null}

        {state.status === "stopping" || state.status === "uploading" ? (
          <Button type="button" variant="outline" disabled className="gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {state.status === "stopping" ? "Finishing…" : "Uploading…"}
          </Button>
        ) : null}

        {state.status === "ready" || state.status === "uploading" ? (
          <audio
            controls
            src={state.objectUrl}
            className="h-10 max-w-[260px] flex-1"
            preload="metadata"
          />
        ) : null}

        {state.status === "ready" || state.status === "uploading" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearRecording}
            disabled={state.status === "uploading"}
            className="gap-1 text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" /> Discard
          </Button>
        ) : null}
      </div>

      {state.status === "error" ? (
        <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
