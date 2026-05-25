"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImageIcon, Loader2, Trash2, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "student-photos";
const MAX_DIMENSION = 600;
const JPEG_QUALITY = 0.78;
const MAX_OUTPUT_BYTES = 200 * 1024;

type Props = {
  /** Optional student id; lets us namespace uploads when known (new-student form has no id yet). */
  studentId?: string;
  /** Hidden input name the parent form submits. */
  inputName: string;
  /** Existing photo_path value to start with. */
  initialPath?: string | null;
};

type State =
  | { status: "idle"; path: string | null; previewUrl: string | null }
  | { status: "processing" }
  | { status: "uploading"; previewUrl: string }
  | { status: "error"; message: string; path: string | null; previewUrl: string | null };

async function resizeToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const longestSide = Math.max(bitmap.width, bitmap.height);
  const scale = longestSide > MAX_DIMENSION ? MAX_DIMENSION / longestSide : 1;
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Image processing is not available in this browser.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob((result) => resolve(result), "image/jpeg", quality),
  );

  while (blob && blob.size > MAX_OUTPUT_BYTES && quality > 0.4) {
    quality -= 0.1;
    blob = await new Promise((resolve) =>
      canvas.toBlob((result) => resolve(result), "image/jpeg", quality),
    );
  }

  if (!blob) {
    throw new Error("Could not encode the resized image.");
  }

  return blob;
}

async function loadSignedUrlForPath(path: string): Promise<string | null> {
  try {
    const response = await fetch(
      `/protected/students/photo?path=${encodeURIComponent(path)}`,
      { headers: { accept: "application/json" } },
    );

    if (!response.ok) return null;
    const data = (await response.json()) as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}

export function StudentPhotoUpload({ studentId, inputName, initialPath }: Props) {
  const [state, setState] = useState<State>({
    status: "idle",
    path: initialPath ?? null,
    previewUrl: null,
  });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialPath) return;
    loadSignedUrlForPath(initialPath).then((url) => {
      if (url) {
        setState((previous) =>
          previous.status === "idle"
            ? { ...previous, previewUrl: url }
            : previous,
        );
      }
    });
  }, [initialPath]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setState({
        status: "error",
        message: "Only image files are supported.",
        path: state.status === "error" ? state.path : state.status === "idle" ? state.path : null,
        previewUrl: null,
      });
      return;
    }

    let blob: Blob;
    try {
      setState({ status: "processing" });
      blob = await resizeToJpeg(file);
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Could not process image.",
        path: null,
        previewUrl: null,
      });
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const previewUrl = URL.createObjectURL(blob);
    objectUrlRef.current = previewUrl;
    setState({ status: "uploading", previewUrl });

    const supabase = createClient();
    const folder = studentId?.trim() || "new";
    const objectName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(objectName, blob, {
      contentType: "image/jpeg",
      cacheControl: "private, max-age=0",
      upsert: false,
    });

    if (error) {
      setState({
        status: "error",
        message: error.message || "Upload failed.",
        path: null,
        previewUrl,
      });
      return;
    }

    setState({ status: "idle", path: objectName, previewUrl });
  }

  function clearPhoto() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setState({ status: "idle", path: null, previewUrl: null });
  }

  const path =
    state.status === "idle" || state.status === "error" ? state.path ?? "" : "";
  const previewUrl =
    state.status === "uploading"
      ? state.previewUrl
      : state.status === "idle" || state.status === "error"
        ? state.previewUrl
        : null;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-surface-2 p-3">
      <input type="hidden" name={inputName} value={path} />
      <div className="flex items-center gap-3">
        <div className="size-16 shrink-0 overflow-hidden rounded-full border border-border bg-card">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Student photo preview" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <ImageIcon className="size-7" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => cameraRef.current?.click()}
            disabled={state.status === "processing" || state.status === "uploading"}
          >
            <Camera className="size-4" aria-hidden="true" /> Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => inputRef.current?.click()}
            disabled={state.status === "processing" || state.status === "uploading"}
          >
            <ImageIcon className="size-4" aria-hidden="true" /> Choose file
          </Button>
          {(state.status === "idle" && state.path) || (state.status === "error" && state.path) ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 text-destructive"
              onClick={clearPhoto}
            >
              <Trash2 className="size-4" aria-hidden="true" /> Remove
            </Button>
          ) : null}
        </div>
      </div>

      {state.status === "processing" || state.status === "uploading" ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {state.status === "processing" ? "Resizing…" : "Uploading…"}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}

      <p className="text-[11px] text-muted-foreground">
        Photo is optional. Auto-resized to {MAX_DIMENSION}px max and {Math.round(MAX_OUTPUT_BYTES / 1024)} KB.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
          event.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleFile(file);
          }
          event.target.value = "";
        }}
      />
    </div>
  );
}
