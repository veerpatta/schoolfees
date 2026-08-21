"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, ImageIcon, Loader2, Trash2, Upload, AlertCircle } from "lucide-react";

import { Button } from "@/ui/primitives/button";
import { createClient } from "@/platform/supabase/client";
import { cn } from "@/platform/utils";

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

type Status = "idle" | "processing" | "uploading";

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

/**
 * Photo picker for the student forms.
 *
 * The hidden input is the whole contract: it carries the object path, and a
 * blank value means "no photo" — which the edit form reads as a removal. So a
 * failed pick must never blank it. A bad file, a browser that cannot decode it,
 * or an upload that errors all leave the previously saved photo exactly where it
 * was; only the explicit Remove button clears the field.
 */
export function StudentPhotoUpload({ studentId, inputName, initialPath }: Props) {
  const [path, setPath] = useState<string | null>(initialPath ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [justUploaded, setJustUploaded] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  /** The object URL currently on screen, if the preview came from a local blob. */
  const objectUrlRef = useRef<string | null>(null);

  const busy = status !== "idle";

  useEffect(() => {
    if (!initialPath) return;
    loadSignedUrlForPath(initialPath).then((url) => {
      // A local pick that landed while the signed URL was in flight wins.
      if (url && !objectUrlRef.current) {
        setPreviewUrl((current) => current ?? url);
      }
    });
  }, [initialPath]);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  async function handleFile(file: File) {
    setJustUploaded(false);

    if (!file.type.startsWith("image/")) {
      setErrorMessage("That is not an image. Choose a JPG, PNG or HEIC file.");
      return;
    }

    let blob: Blob;
    try {
      setErrorMessage(null);
      setStatus("processing");
      blob = await resizeToJpeg(file);
    } catch (error) {
      setStatus("idle");
      setErrorMessage(
        error instanceof Error ? error.message : "Could not process that image.",
      );
      return;
    }

    // Hold on to what was on screen: if the upload fails we put it back rather
    // than leaving the student looking like they have no photo.
    const previousObjectUrl = objectUrlRef.current;
    const previousPreviewUrl = previewUrl;

    const nextPreviewUrl = URL.createObjectURL(blob);
    objectUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setStatus("uploading");

    const supabase = createClient();
    const folder = studentId?.trim() || "new";
    const objectName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(objectName, blob, {
      contentType: "image/jpeg",
      cacheControl: "private, max-age=0",
      upsert: false,
    });

    if (error) {
      URL.revokeObjectURL(nextPreviewUrl);
      objectUrlRef.current = previousObjectUrl;
      setPreviewUrl(previousPreviewUrl);
      setStatus("idle");
      setErrorMessage(error.message || "Upload failed. Try again.");
      return;
    }

    if (previousObjectUrl) URL.revokeObjectURL(previousObjectUrl);
    setPath(objectName);
    setStatus("idle");
    setJustUploaded(true);
  }

  function clearPhoto() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPath(null);
    setPreviewUrl(null);
    setErrorMessage(null);
    setJustUploaded(false);
  }

  function takeFirstImage(files: FileList | null) {
    const file = files?.[0];
    if (file) void handleFile(file);
  }

  const hasPhoto = Boolean(path);
  const statusLine = busy
    ? status === "processing"
      ? "Resizing…"
      : "Uploading…"
    : justUploaded
      ? "Photo ready — save the form to keep it."
      : hasPhoto
        ? "Photo on file."
        : "No photo yet.";

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface-2 p-3 transition-colors md:p-4",
        isDragging && "border-primary bg-primary/5",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        if (busy) return;
        takeFirstImage(event.dataTransfer.files);
      }}
    >
      <input type="hidden" name={inputName} value={path ?? ""} />

      <div className="flex items-center gap-4">
        {/* The picture is the biggest target on the card, and tapping it is the
            thing everyone tries first. */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={hasPhoto ? "Replace student photo" : "Add student photo"}
          className="focus-ring group relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-card disabled:cursor-progress md:size-24"
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Student photo preview"
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageIcon className="size-7" aria-hidden="true" />
              <span className="text-[10px] font-semibold uppercase tracking-wide">Add</span>
            </span>
          )}

          {busy ? (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-6 animate-spin text-foreground" aria-hidden="true" />
            </span>
          ) : previewUrl ? (
            <span className="absolute inset-x-0 bottom-0 hidden bg-foreground/70 py-1 text-[10px] font-semibold uppercase tracking-wide text-background group-hover:block group-focus-visible:block">
              Change
            </span>
          ) : null}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <p
            className={cn(
              "flex items-center gap-1.5 text-sm font-semibold",
              justUploaded ? "text-success-soft-foreground" : "text-foreground",
            )}
            aria-live="polite"
          >
            {busy ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
            ) : justUploaded ? (
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
            ) : null}
            {statusLine}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
            >
              <Camera className="size-4" aria-hidden="true" /> Take photo
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              <Upload className="size-4" aria-hidden="true" />
              {hasPhoto ? "Replace" : "Choose file"}
            </Button>
            {hasPhoto ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 text-destructive hover:text-destructive"
                onClick={clearPhoto}
                disabled={busy}
              >
                <Trash2 className="size-4" aria-hidden="true" /> Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {errorMessage ? (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {errorMessage}
        </p>
      ) : null}

      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
        Optional. Drag an image here or use the buttons — it is resized to{" "}
        {MAX_DIMENSION}px and about {Math.round(MAX_OUTPUT_BYTES / 1024)} KB before upload.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          takeFirstImage(event.target.files);
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
          takeFirstImage(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
