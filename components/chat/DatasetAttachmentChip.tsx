"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Download, Loader2, Table2 } from "lucide-react";
import type { DatasetAttachmentMeta } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type DownloadState = "idle" | "downloading" | "error";

/**
 * The file chip shown on a user message that had a dataset (CSV) attached —
 * mirrors DocumentAttachmentChip, with a row count instead of a character
 * count and the same "Download original" support (see that component's
 * doc comment).
 */
export function DatasetAttachmentChip({
  meta,
  csvText,
  messageId,
  hasFileAttachment,
  onLight,
}: {
  meta: DatasetAttachmentMeta;
  csvText?: string;
  messageId?: string;
  hasFileAttachment?: boolean;
  /** True when rendered on the brand-colored user bubble, so text stays readable against it. */
  onLight?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");

  async function handleDownload() {
    if (!messageId || downloadState === "downloading") return;
    setDownloadState("downloading");
    try {
      const res = await fetch(`/api/messages/${messageId}/attachment`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(json?.error?.message ?? "Could not download this file.");
      window.open(json.data.url, "_blank", "noopener,noreferrer");
      setDownloadState("idle");
    } catch (err) {
      console.error("[attachment] download failed:", err);
      setDownloadState("error");
      setTimeout(() => setDownloadState("idle"), 3000);
    }
  }

  const sizeLabel =
    meta.rowCount !== undefined
      ? `${meta.rowCount.toLocaleString()} rows${meta.truncated ? " (truncated)" : ""}`
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
        <Table2 className="h-4 w-4 flex-none" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{meta.filename}</span>
        <span className={cn("flex-none font-mono text-[11px] uppercase", onLight ? "text-white/70" : "text-faint")}>
          Dataset
          {sizeLabel ? ` · ${sizeLabel}` : ""}
        </span>
        {hasFileAttachment && messageId && (
          <button
            onClick={handleDownload}
            disabled={downloadState === "downloading"}
            aria-label="Download original file"
            title="Download original file"
            className={cn("flex-none rounded p-0.5", onLight ? "hover:bg-white/10" : "hover:bg-border-soft")}
          >
            {downloadState === "downloading" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Download className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        )}
        {csvText && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide dataset contents" : "View dataset contents"}
            className={cn("flex-none rounded p-0.5", onLight ? "hover:bg-white/10" : "hover:bg-border-soft")}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      {downloadState === "error" && (
        <p className={cn("text-[12px]", onLight ? "text-white/80" : "text-danger")}>
          Couldn&apos;t download this file. Please try again.
        </p>
      )}
      {expanded && csvText && (
        <pre
          className={cn(
            "max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border p-2 font-mono text-[12px] leading-relaxed",
            onLight ? "border-white/20 bg-black/10 text-white/90" : "border-border-soft bg-surface text-muted"
          )}
        >
          {csvText}
        </pre>
      )}
    </div>
  );
}
