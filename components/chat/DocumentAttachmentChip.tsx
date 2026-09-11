"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { documentTypeLabel } from "@/lib/document";
import type { DocumentAttachmentMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The file chip shown on a user message that had a document attached —
 * never the raw extracted text dumped into the bubble. `extractedText`, when
 * provided (i.e. after a reload, once the persisted `[[document: ...]]`
 * marker has been parsed), can be expanded so the user can verify exactly
 * what the AI read from their file.
 */
export function DocumentAttachmentChip({
  meta,
  extractedText,
  onLight,
}: {
  meta: DocumentAttachmentMeta;
  extractedText?: string;
  /** True when rendered on the brand-colored user bubble, so text stays readable against it. */
  onLight?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const sizeLabel =
    meta.charCount !== undefined
      ? `${meta.charCount.toLocaleString()} chars${meta.truncated ? " (truncated)" : ""}`
      : meta.fileSizeBytes !== undefined
        ? formatFileSize(meta.fileSizeBytes)
        : null;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-lg border px-3 py-2 text-[13px]",
        onLight ? "border-white/30 bg-white/10 text-white" : "border-border bg-bg text-text"
      )}
    >
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 flex-none" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{meta.filename}</span>
        <span className={cn("flex-none font-mono text-[11px] uppercase", onLight ? "text-white/70" : "text-faint")}>
          {documentTypeLabel(meta.mimeType)}
          {sizeLabel ? ` · ${sizeLabel}` : ""}
        </span>
        {extractedText && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide extracted content" : "View extracted content"}
            className={cn("flex-none rounded p-0.5", onLight ? "hover:bg-white/10" : "hover:bg-border-soft")}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {expanded && extractedText && (
        <pre
          className={cn(
            "max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border p-2 font-mono text-[12px] leading-relaxed",
            onLight ? "border-white/20 bg-black/10 text-white/90" : "border-border-soft bg-surface text-muted"
          )}
        >
          {extractedText}
        </pre>
      )}
    </div>
  );
}
