"use client";

import { Download, Loader2, RefreshCcw } from "lucide-react";
import type { ParsedGeneratedImage } from "@/lib/generatedImage";

/** Renders an AI-generated image inline in an assistant message, with Regenerate and Download actions. */
export function GeneratedImageCard({
  image,
  onRegenerate,
  regenerating,
}: {
  image: ParsedGeneratedImage;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const dataUrl = `data:${image.mimeType};base64,${image.data}`;

  return (
    <div className="flex flex-col gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- data URI from a generated image, not a static asset next/image can optimize */}
      <img src={dataUrl} alt={image.prompt} className="max-h-96 w-full rounded-lg border border-border-soft object-contain" />
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
        <a
          href={dataUrl}
          download={`arova-generated-${Date.now()}.png`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[13px] font-medium text-text hover:bg-border-soft"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download
        </a>
      </div>
    </div>
  );
}
