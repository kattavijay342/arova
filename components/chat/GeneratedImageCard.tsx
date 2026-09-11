"use client";

import { useEffect, useState } from "react";
import { Download, ImageOff, Loader2, RefreshCcw } from "lucide-react";
import type { ParsedGeneratedImage } from "@/lib/generatedImage";

/**
 * Renders an AI-generated image inline in an assistant message, with
 * Regenerate and Download actions. `image.data` is empty for an image kept
 * in Storage rather than embedded as base64 (see lib/generatedImage.ts) —
 * in that case this fetches a short-lived signed URL via the same
 * per-message attachment endpoint the document/dataset chips and
 * PersistedImageAttachment already use, instead of rendering a data URI
 * directly. A non-empty `image.data` (an image generated before Storage
 * persistence existed) still renders exactly as it always did.
 */
export function GeneratedImageCard({
  image,
  messageId,
  onRegenerate,
  regenerating,
}: {
  image: ParsedGeneratedImage;
  messageId: string;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const isStorageBacked = !image.data;
  const [url, setUrl] = useState<string | null>(isStorageBacked ? null : `data:${image.mimeType};base64,${image.data}`);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isStorageBacked) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/messages/${messageId}/attachment`);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) throw new Error();
        if (!cancelled) setUrl(json.data.url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isStorageBacked, messageId]);

  function handleDownload() {
    if (!url) return;
    if (isStorageBacked) {
      // A signed Storage URL is cross-origin — <a download> is unreliable
      // there (most browsers just navigate instead of forcing a save), so
      // this opens it in a new tab the same way the attachment chips'
      // download buttons do, rather than relying on the download attribute
      // used below for the same-origin data: URI case.
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  if (failed) {
    return (
      <div className="flex h-48 w-full items-center justify-center gap-1.5 rounded-lg border border-border-soft bg-surface text-[13px] text-muted">
        <ImageOff className="h-4 w-4" aria-hidden />
        Image unavailable
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-48 w-full items-center justify-center rounded-lg border border-border-soft bg-surface">
        <Loader2 className="h-5 w-5 animate-spin text-muted" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URI (legacy) or a short-lived signed URL, neither worth next/image here */}
      <img src={url} alt={image.prompt} className="max-h-96 w-full rounded-lg border border-border-soft object-contain" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-text hover:bg-border-soft disabled:cursor-not-allowed disabled:opacity-50"
        >
          {regenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" aria-hidden />
          )}
          {regenerating ? "Regenerating…" : "Regenerate"}
        </button>
        {isStorageBacked ? (
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-text hover:bg-border-soft"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </button>
        ) : (
          <a
            href={url}
            download={`arova-generated-${Date.now()}.png`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-text hover:bg-border-soft"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download
          </a>
        )}
      </div>
    </div>
  );
}
